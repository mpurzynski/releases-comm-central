var jum = {}; ChromeUtils.import("chrome://mozmill/content/modules/jum.js", jum);

var testPythonCallback = function() {
  var state = "test"
  mozmill.firePythonCallback("nowCallback", state)
}

var testPythonFail = function() {
    mozmill.firePythonCallback("failCallback", null);
}
