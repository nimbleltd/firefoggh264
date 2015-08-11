//-*- coding: utf-8 -*-
// vi:si:et:sw=2:sts=2:ts=2
/*
  Firefogg - video encoding and uploading for Firefox
			 http://firefogg.org/
             2008, 2009 - GPL 3.0
 */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://firefogg/utils.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;

function FirefoggProtocol() {
}

FirefoggProtocol.prototype =
{
  classDescription: "Firefogg preview protocol",
  classID: Components.ID("789409b9-2e3b-4682-a5d1-71ca80a76456"),
  contractID: "@mozilla.org/network/protocol;1?name=firefogg",
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIFirefoggProtocol,
                                         Ci.nsIProtocolHandler,
                                         Ci.nsISupports]),
  _xpcom_factory : {
    createInstance: function (outer, iid) {
      if (outer != null)
        throw Components.results.NS_ERROR_NO_AGGREGATION;

      if (!iid.equals(Ci.nsIProtocolHandler) &&
          !iid.equals(Ci.nsISupports) &&
          !iid.equals(Ci.nsIFirefoggProtocol) )
        throw Components.results.NS_ERROR_NO_INTERFACE;

      return (new FirefoggProtocol()).QueryInterface(iid);
    }
  },
  scheme: "firefogg",
  defaultPort: -1,
  protocolFlags: Ci.nsIProtocolHandler.URI_NORELATIVE |
             Ci.nsIProtocolHandler.URI_NOAUTH |
             Ci.nsIProtocolHandler.URI_LOADABLE_BY_ANYONE,

  allowPort: function(port, scheme)
  {
    return false;
  },

  newURI: function(spec, charset, baseURI)
  {
    var uri = Cc["@mozilla.org/network/simple-uri;1"].createInstance(Ci.nsIURI);
    uri.spec = spec;
    return uri;
  },

  newChannel: function(input_uri)
  {
    // aURI is a nsIUri, so get a string from it using .spec
    var key = input_uri.spec;

    // strip away the kSCHEME: part
    key = key.substring(key.indexOf("://") + 3, key.length);    
    key = encodeURI(key);

    //if key is registered, return new channel, null otherwise
    if (this.urls[key]) {
      var url = this.urls[key];
      var ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
      return ios.newChannel(url, null, null);
    }
    return false;

  },
  /* public */
  addUrl: function(url) {
    while (1) {
      var key = utils.makeRandomString(8);
      if (!this.urls[key]) {
        this.urls[key] = url;
        break;
      }
    }
    return "firefogg://" + key;
  },
  removeUrl: function(key) {
    key = key.substring(key.indexOf("://") + 3, key.length);    
    delete this.urls[key];
  },
  /* private */
  urls: {},
} 

var NSGetFactory = XPCOMUtils.generateNSGetFactory([FirefoggProtocol]);
