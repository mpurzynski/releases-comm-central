/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
// vim:set ts=2 sw=2 sts=2 et ft=javascript:

ChromeUtils.import("resource://gre/modules/Services.jsm");

/**
 * This file exports the JSMime code, polyfilling code as appropriate for use in
 * Gecko.
 */

// Load the core MIME parser. Since it doesn't define EXPORTED_SYMBOLS, we must
// use the subscript loader instead.
Services.scriptloader.loadSubScript("resource:///modules/jsmime/jsmime.js");

var EXPORTED_SYMBOLS = ["jsmime"];

function bytesToString(buffer) {
  var string = '';
  for (var i = 0; i < buffer.length; i++)
    string += String.fromCharCode(buffer[i]);
  return string;
}

// Our UTF-7 decoder.
function UTF7TextDecoder(label, options = {}) {
  this.manager = Cc["@mozilla.org/charset-converter-manager;1"]
                   .createInstance(Ci.nsICharsetConverterManager);
  // The following will throw if the charset is unknown.
  let charset = this.manager.getCharsetAlias(label);
  if (charset.toLowerCase() != "utf-7")
    throw new Error("UTF7TextDecoder: This code should never be reached for " + label);
  this.collectInput = "";
}
UTF7TextDecoder.prototype = {
  // Since the constructor checked, this will only be called for UTF-7.
  decode: function (input, options = {}) {
    let more = 'stream' in options ? options.stream : false;
    // There are cases where this is called without input.
    if (!input)
      return "";
    this.collectInput += bytesToString(input);
    if (more)
      return "";
    return this.manager.utf7ToUnicode(this.collectInput);
  },
};

function MimeTextDecoder(charset, options) {
  try {
    return new TextDecoder(charset, options);
  } catch (e) {
    // If TextDecoder fails, it must be UTF-7 or an invalid charset.
    return new UTF7TextDecoder(charset, options);
  }
}


// The following code loads custom MIME encoders.
var CATEGORY_NAME = "custom-mime-encoder";
Services.obs.addObserver(function (subject, topic, data) {
  subject = subject.QueryInterface(Ci.nsISupportsCString)
                   .data;
  if (data == CATEGORY_NAME) {
    let url = catman.getCategoryEntry(CATEGORY_NAME, subject);
    Services.scriptloader.loadSubScript(url, {}, "UTF-8");
  }
}, "xpcom-category-entry-added");

var catman = Cc["@mozilla.org/categorymanager;1"]
               .getService(Ci.nsICategoryManager);

var entries = catman.enumerateCategory(CATEGORY_NAME);
while (entries.hasMoreElements()) {
  let string = entries.getNext()
                      .QueryInterface(Ci.nsISupportsCString)
                      .data;
  let url = catman.getCategoryEntry(CATEGORY_NAME, string);
  Services.scriptloader.loadSubScript(url, {}, "UTF-8");
}
