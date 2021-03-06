function MobileServiceAuthenticationProvider(){
}
MobileServiceAuthenticationProvider.Facebook = 'facebook';
function MobileServiceHTTPMethods(){
}
MobileServiceHTTPMethods.GET='GET';
MobileServiceHTTPMethods.POST='POST';
MobileServiceHTTPMethods.PATCH='PATCH';
MobileServiceHTTPMethods.PUT='PUT';
MobileServiceHTTPMethods.DELETE='DELETE';

function MobileServiceUser (userId) {
	if(!userId) throw new Error('A userId is required.');
	var authenticationToken = null;
	this.getUserId = function(){
		return userId;
	};
	this.setAuthenticationToken=function(v){
		authenticationToken=v;
	};
	this.getAuthenticationToken=function(){
		return authenticationToken;
	};
};
function LoginManager(mobileServiceClient) {
	if(!mobileServiceClient) throw new Error("A mobileServiceClient is required.");
	
	var LOGIN_URL = "login/";
	var TOKEN_JSON_PARAMETER = "authenticationToken";
	var USERID_JSON_PROPERTY = "userId";
	var USER_JSON_PROPERTY = "user";
	var ERROR_JSON_PROPERTY = "error";
	
	var customClaims = null;
	
	var createUser = function(jsonUserObj){
		if(!jsonUserObj) throw new Error("Cannot create a user from a null object");
		if(!jsonUserObj[USER_JSON_PROPERTY]) throw new Error(USER_JSON_PROPERTY + " property expected");
		if(!jsonUserObj[USER_JSON_PROPERTY][USERID_JSON_PROPERTY]) throw new Error(USER_JSON_PROPERTY + "."+ USERID_JSON_PROPERTY + " property expected");
		if(!jsonUserObj[TOKEN_JSON_PARAMETER]) throw new Error(TOKEN_JSON_PARAMETER + " property expected");
		var user = new MobileServiceUser(jsonUserObj[USER_JSON_PROPERTY][USERID_JSON_PROPERTY]);
		user.setAuthenticationToken(jsonUserObj[TOKEN_JSON_PARAMETER]);
		return user;
	};
	
	this.authenticateWithToken=function(provider, token, callBack) {
		if (!provider || !token || !callBack){
			throw new Error("All provider, token, and callBack are required.");
		}
		var xhr = Titanium.Network.createHTTPClient();
		xhr.setTimeout(mobileServiceClient.REQUEST_TIMEOUT);
		xhr.onload=function() {
			try{
				var user=createUser(JSON.parse(this.responseText));
				callBack(null,user);
			}
			catch(e){
				callBack(e);
			}
		};
		xhr.onerror= function(e1) {
			callBack(e1);
		};
		xhr.open(MobileServiceHTTPMethods.POST, mobileServiceClient.getAppUrl()+LOGIN_URL+provider);
		xhr.setRequestHeader("Content-Type", "application/json");
		xhr.setRequestHeader("Accept", "application/json");
		var bdy = {
		    "access_token" : token
		};
		if(customClaims){
			for (var att in customClaims) { 
				if(att !== "access_token")
					bdy[att] = customClaims[att]; 
			}
		}
		xhr.send(bdy);
	};
	this.enableClaimBasedAuth=function(newUrl, claims){
		LOGIN_URL = newUrl;
		customClaims = claims;
	};
};

function MobileServiceTable(name, mobileServiceClient){
	if(!name || !mobileServiceClient) throw new Error("The name of the table and a mobileServiceClient is required.");
	var TABLE_URL = "tables/";
	this._execute=function(httpMethod, id, requestBody, requestParam, callBack){
		if(!httpMethod || !callBack) new Error("Both httpMethod and callBack are required");
		
		else{
			var xhr = Titanium.Network.createHTTPClient();
			xhr.setTimeout(mobileServiceClient.REQUEST_TIMEOUT);
			xhr.onload=function() {
				var o = JSON.parse(this.responseText);
				if(o && o['error']) callBack(o['error'],null);
				else callBack(null,o);
			};
			xhr.onerror= function(e) {
				callBack(e,null);
			};
			var url=mobileServiceClient.getAppUrl()+TABLE_URL+name;
			if(id) url += '/'+id;
			if(requestParam) url+='?'+mobileServiceClient.buildHttpQuery(requestParam);
			xhr.open(httpMethod, url);
			xhr.setRequestHeader("Content-Type", "application/json");
			xhr.setRequestHeader("Accept", "application/json");
			xhr.setRequestHeader("X-ZUMO-APPLICATION",mobileServiceClient.getAppKey());
			if(mobileServiceClient.getCurrentUser() && mobileServiceClient.getCurrentUser().getAuthenticationToken())
				xhr.setRequestHeader("X-ZUMO-AUTH", mobileServiceClient.getCurrentUser().getAuthenticationToken());
			if(requestBody) xhr.send(JSON.stringify(requestBody));
			else xhr.send();
		}
	};
}
MobileServiceTable.prototype.lookUp=function(id,callBack){
	if(!id){
		callBack("id is required.");
	}
	else{
		this._execute(MobileServiceHTTPMethods.GET, id, null, null, callBack);
	}
};
MobileServiceTable.prototype.insert=function(obj,callBack){
	this._execute(MobileServiceHTTPMethods.POST, null, obj, null, callBack);
};
MobileServiceTable.prototype.update=function(id, obj,callBack){
	if(!id || !obj){
		callBack("id and a obj with at lease one property is required.");
	}
	else{
		this._execute(MobileServiceHTTPMethods.PATCH, id, obj, null, callBack);
	}
};
MobileServiceTable.prototype.del=function(id, callBack){
	if(!id){
		callBack("id and a obj with at lease one property is required.");
	}
	else{
		this._execute(MobileServiceHTTPMethods.DELETE, id, null, null, callBack);
	}
};
function MobileServiceClient(appUrl, appKey) {
	if (!appUrl || !appKey){
		throw new Error("Both appUrl and appKey are required.");
	}
	if(appUrl.charAt(appUrl.length-1) != '/'){
		appUrl+='/';
	}
	
	var CUSTOM_API_URL = "api/";
	
	var loginManager = new LoginManager(this);
	var loginInProgress = false;
	var mobileServiceUser = null;

	this.enableClaimBasedAuth=function(newUrl, claims){
		if (!newUrl){
			throw new Error("A newUrl for the login endpoint is required.");
		}
		loginManager.enableClaimBasedAuth(newUrl,claims);
	};
	this.login=function(provider, oAuthToken, callBack) {
		if (!provider || !oAuthToken || !callBack){
			throw new Error("All provider, oAuthToken, and callBack are required.");
		}
		loginInProgress = true;
		loginManager.authenticateWithToken(provider,oAuthToken,function(err, user){
			if(err) callBack(err);
			else{
				mobileServiceUser=user;
				loginInProgress = false;
				callBack(null,user);
			}
		});
	};
	
	this.logout=function(callBack) {
		if (!callBack){
			throw new Error("A callBack is required.");
		}
		else{
			var fb=require('facebook');
			if(fb.appid){ //login with facebook is used
				fb.addEventListener('logout', function onFbLogout(){
					fb.removeEventListener('logout', onFbLogout);
					if(fb.onFacebookLogin)
						fb.removeEventListener('login', fb.onFacebookLogin);
					mobileServiceUser = null;
					callBack();
				});
				fb.logout();
			}
			else{
				mobileServiceUser = null;
			}
		}
		
	};
	this.getAppKey=function() {
		return appKey;
	};
	this.getAppUrl=function() {
		return appUrl;
	};
	this.isLoginInProgress=function() {
		return loginInProgress;
	};
	this.isLoggedIn=function(){
		return mobileServiceUser != null;
	}; 
	this.getCurrentUser=function() {
		return mobileServiceUser;
	};
	this.modifyLoginURL=function(newUrl){
		loginManager.modifyLoginURL(newUrl);
	};
	this.invokeApi=function(apiName, httpMethod, requestBody, requestParam, callBack){
		if(!apiName || !httpMethod || !callBack) new Error("apiName, httpMethod, and callBack are required");
		else{
			var xhr = Titanium.Network.createHTTPClient();
			xhr.setTimeout(this.REQUEST_TIMEOUT);
			xhr.onload=function() {
				var o = JSON.parse(this.responseText);
				if(o && o['error']) callBack(o['error'],null);
				else callBack(null,o);
			};
			xhr.onerror= function(e) {
				callBack(e,null);
			};
			var url=appUrl+CUSTOM_API_URL+apiName;
			if(requestParam) url+='?'+this.buildHttpQuery(requestParam);
			xhr.open(httpMethod, url);
			xhr.setRequestHeader("Content-Type", "application/json");
			xhr.setRequestHeader("Accept", "application/json");
			xhr.setRequestHeader("X-ZUMO-APPLICATION",appKey);
			if(mobileServiceUser && mobileServiceUser.getAuthenticationToken())
				xhr.setRequestHeader("X-ZUMO-AUTH", mobileServiceUser.getAuthenticationToken());
			if(requestBody) xhr.send(JSON.stringify(requestBody));
			else xhr.send();
		}
	};
}
MobileServiceClient.prototype.REQUEST_TIMEOUT=30000;
MobileServiceClient.prototype.initFacebook=function(fbAppId, permissions) {
	var fb=require('facebook');
	fb.appid = fbAppId;
	fb.permissions = permissions || [];
	fb.forceDialogAuth = false;
};

MobileServiceClient.prototype.loginByFacebook=function(callBack) {
	var self = this;
	var fb=require('facebook');
	if (!callBack){
		throw new Error("A callBack is required.");
	}
	if(!fb.appid){
		callBack("Facebook is not initialized. Call initFacebook function before login.");
	}
	else{
		if(fb.getLoggedIn()){
			Ti.API.info('Already Loggedin to Facebook');
			self.login(MobileServiceAuthenticationProvider.Facebook, fb.getAccessToken(), callBack);
		}
		else{
			fb.onFacebookLogin = function(e) {
			    if (e.success) {
			    	Ti.API.info('On Facebook Login Event Listener');
			        self.login(MobileServiceAuthenticationProvider.Facebook, fb.getAccessToken(), callBack);
			    }
			    else if(e.error){
			    	callBack(e.error);
			    }
			};
			fb.addEventListener('login', fb.onFacebookLogin);
			fb.authorize();
		}
	}
};
MobileServiceClient.prototype.loginWithClaims=function(provider, oAuthToken, newUrl, claims, callBack) {
	this.enableClaimBasedAuth(newUrl,claims);
	this.login(provider, oAuthToken,callBack);
};
MobileServiceClient.prototype.loginWithClaimsByFacebook=function(newUrl, claims, callBack) {
	this.enableClaimBasedAuth(newUrl,claims);
	this.loginByFacebook(callBack);
};
MobileServiceClient.prototype.invokeGetApi=function(apiName, requestParam, callBack){
	this.invokeApi(apiName, MobileServiceHTTPMethods.GET, null, requestParam, callBack);
};
MobileServiceClient.prototype.invokePostApi=function(apiName, requestBody, callBack){
	this.invokeApi(apiName, MobileServiceHTTPMethods.POST, requestBody, null, callBack);
};
MobileServiceClient.prototype.invokePatchApi=function(apiName, requestBody, requestParam, callBack){
	this.invokeApi(apiName, MobileServiceHTTPMethods.PATCH, requestBody, requestParam, callBack);
};
MobileServiceClient.prototype.invokePutApi=function(apiName, requestBody, requestParam, callBack){
	this.invokeApi(apiName, MobileServiceHTTPMethods.PUT, requestBody, requestParam, callBack);
};
MobileServiceClient.prototype.invokeDeleteApi=function(apiName, requestParam, callBack){
	this.invokeApi(apiName, MobileServiceHTTPMethods.DELETE, requestParam, callBack);
};
MobileServiceClient.prototype.getTable=function(name){
	return new MobileServiceTable(name,this);
};
MobileServiceClient.prototype.buildHttpQuery=function(formdata, numeric_prefix, arg_separator) {
    var value, key, tmp = [],
        that = this;
    this.urlencode = function (str) {
        str = (str + '').toString();
        return encodeURIComponent(str).replace(/!/g, '%21').replace(/'/g, '%27').replace(/\(/g, '%28').
        replace(/\)/g, '%29').replace(/\*/g, '%2A').replace(/%20/g, '+');
    };
    var _http_build_query_helper = function (key, val, arg_separator) {
        var k, tmp = [];
        if (val === true) {
            val = "1";
        } else if (val === false) {
            val = "0";
        }
        if (val != null) {
            if (typeof val === "object") {
                for (k in val) {
                    if (val[k] != null) {
                        tmp.push(_http_build_query_helper(key + "[" + k + "]", val[k], arg_separator));
                    }
                }
                return tmp.join(arg_separator);
            } else if (typeof val !== "function") {
                return that.urlencode(key) + "=" + that.urlencode(val);
            } else {
                throw new Error('There was an error processing for http_build_query().');
            }
        } else {
            return '';
        }
    };

    if (!arg_separator) {
        arg_separator = "&";
    }
    for (key in formdata) {
        value = formdata[key];
        if (numeric_prefix && !isNaN(key)) {
            key = String(numeric_prefix) + key;
        }
        var query = _http_build_query_helper(key, value, arg_separator);
        if (query !== '') {
            tmp.push(query);
        }
    }
    return tmp.join(arg_separator);
};
exports.MobileServiceHTTPMethods=MobileServiceHTTPMethods;
exports.MobileServiceClient = MobileServiceClient; 
exports.MobileServiceAuthenticationProvider=MobileServiceAuthenticationProvider;
exports.version = '1.0.0';
exports.author = 'Faisal Rahman';