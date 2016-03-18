var db = require("../server/db");

var credentials = require("../credentials");
var ACCOUNT_SID = credentials.accountSid;
var AUTH_TOKEN = credentials.authToken;
var TWILIO_NUM = credentials.twilioNum;

var pass = require("../utils/utils.js")["pass"];
var isLoggedIn = pass.isLoggedIn;


module.exports = function (app, passport) {

	// view current clients for a case manager
  app.get("/cms", isLoggedIn, function (req, res) { 
    var cmid = req.user.cmid;
    var redirect_loc = "/cms/" + cmid;
    res.redirect(redirect_loc);
  });

  app.get("/cms/:cmid", isLoggedIn, function (req, res) { 
    var cmid = req.user.cmid;

    db("cms").where("cmid", cmid).limit(1)
    .then(function (cms) {
      if (cms.length == 0) {
        res.redirect("/404");
      } else {
        if (cms[0].active) {
          db("clients").where("cm", cmid)
          .then(function (clients) {

            var warning = req.flash("warning");
            var success = req.flash("success");

            res.render("clients", {
              cm: cms[0],
              clients: clients,
              warning: warning,
              success: success
            });

          }).catch(function (err) {
            res.redirect("/500");
          });
        } else {
          res.redirect("/404");
        }
      }
    }).catch(function (err) {
      res.redirect("/500");
    })
    
  });

  
  app.post("/cms", isLoggedIn, function (req, res) { 
    var redirect_loc = "/cms";

    var cmid = req.body.cmid;
    var first = req.body.first;
    var middle = req.body.middle;
    var last = req.body.last;
    var dob = req.body.dob;
    var otn = req.body.otn;
    var so = req.body.so;

    if (!middle) middle = "";

    if (!cmid) {
      req.flash("warning", "Missing cmid.");
      res.redirect(redirect_loc);
    } else if (Number(req.user.cmid) !== Number(cmid)) {
      console.log("No match: ", req.user.cmid, cmid)
      req.flash("warning", "This ID does not match with the logged-in user");
      res.redirect(redirect_loc);
    } else if (!first) {
      req.flash("warning", "Missing first name.");
      res.redirect(redirect_loc);
    } else if (!last) {
      req.flash("warning", "Missing last name.");
      res.redirect(redirect_loc);
    } else if (isNaN(Date.parse(dob))) {
      req.flash("warning", "Missing date of birth.");
      res.redirect(redirect_loc);
    } else if (!otn) {
      req.flash("warning", "Missing OTN.");
      res.redirect(redirect_loc);
    } else if (!so) {
      req.flash("warning", "Missing SO number.");
      res.redirect(redirect_loc);
    } else {
      db("clients")
      .insert({
        cm: cmid,
        first: first,
        middle: middle,
        last: last,
        dob: dob,
        otn: otn,
        so: so,
        active: true
      }).then(function (success) {
        req.flash("success", "Added a new client.");
        res.redirect(redirect_loc);
      }).catch(function (err) {
        res.redirect("/500")
      })
    }
    
  });

  // create new client
  app.post("/cm", isLoggedIn, function (req, res) { 
  	var cl = {
  		cm: req.user.cmid,
  	};

	  cl.first = req.body.first;
	  if (!cl.first || cl.first == "" || cl.first.length < 1) {
	  	res.send("First name is missing or too short. " + ahref);
	  }

	  if (req.body.middle !== "" && req.body.middle.length < 1) {
	  	cl.middle = req.body.middle;
	  }

	  cl.last = req.body.last;
	  if (!cl.last || cl.last !== "" && cl.last.length < 1) {
	  	res.send("Last name is missing or too short. " + ahref);
	  }

	  cl.dob = req.body.dob;
	  if (!cl.dob || cl.dob !== "" && cl.dob.length < 1) {
	  	res.send("Date of birth is missing. " + ahref);
	  } else {
	  	var d = cl.dob;
	  	d = d.split("-");
	  	cl.dob = d[2] + d[1] + d[0];
	  }

	  if (req.body.otn) cl.otn = req.body.otn;
	  if (req.body.so) cl.so = req.body.so;

  	db("clients").insert(cl).then(function (clients) {
  		res.redirect("cmview");
  	});
  	
  });

  app.get("/cm/:clid", isLoggedIn, function (req, res) { 
  	var clid = req.params.clid;
  	db("clients").where("cm", req.user.cmid).andWhere("clid", clid).then(function (client) {
  		if (client.length < 1) {
  			res.send("You are unauthorized to access this client's data.")
  		} else {
	  		db("comms").where("client", clid).then(function (comms) {
	  			db("msgs").where("client", clid).orderBy("created", "asc").then(function (msgs) {
	  				var tw_client = require("twilio")(ACCOUNT_SID, AUTH_TOKEN);
	  				for (var i = 0; i < msgs.length; i++) { 
	  					var m = msgs[i];

	  					// update statuses
	  					var status_still_of_interest = !(m.tw_status == "delivered" || m.tw_status == "failed" || m.tw_status == "received");
	  					var has_status = !(m.tw_status == null || m.tw_status == "");
	  					if (status_still_of_interest && has_status) {
								tw_client.sms.messages(m.tw_sid).get(function (err, sms) {
									if (!err) {
										if (sms.status !== m.tw_status) {
											db("msgs").where("tw_sid", m.tw_sid)
											.returning("tw_status")
											.update({tw_status: sms.status}).then(function () {});
										}
									}
								});
	  					}

	  					// update read status
	  					if (!m.read) {
								db("msgs").where("tw_sid", m.tw_sid)
								.update({read: true}).then(function () {});
	  					}
	  				}

	  				// render regardless of above ops
	  				res.render("client", {client: client[0], comms: comms, msgs: msgs});
	  			});
  			});
  		}
  	});
  });

  app.post("/cm/:clid/comm", isLoggedIn, function (req, res) { 
  	var clid = req.params.clid;
  	var ahref = "<a href='/cm/" + clid + "'>Return to user.</a>";

  	var comm = {}
  	if (!req.body.hasOwnProperty("type")) {
  		res.send("Missing Type. " + ahref);
  	} else {
  		comm.type = req.body.type;
  	}

  	if (!req.body.hasOwnProperty("value")) {
  		res.send("Missing Value. " + ahref);
  	} else {
  		var v = req.body.value;
  		if (comm.type == "email" || comm.type == "cell") { 
  			v = v.replace(/[^0-9.]/g, "");
  			if (v.length == 10) {
  				v = "1" + v;
  			}
  			if (v.length == 11) {
  				comm.value = v;	
  			} else {
  				res.send("Bad phone entry. Make sure it includes the country code (e.g. 1-848-123-4567). " + ahref);
  			}
  		} else {
  			comm.value = v;
  		}
  	}

  	if (!req.body.hasOwnProperty("description")) {
  		res.send("Missing Description. " + ahref);
  	} else {
  		comm.description = req.body.description;
  	}

  	comm.client = clid;
  	db("comms").insert(comm).then(function (client) {
  		res.redirect("/cm/" + clid);
  	});
  });

  app.post("/cm/:clid/send", isLoggedIn, function (req, res) { 
  	var clid = req.params.clid;
  	var ahref = "<a href='/cm/" + clid + "'>Return to user.</a>";

  	if (req.body.hasOwnProperty("device")) {
  		req.body.device = JSON.parse(req.body.device);
  	} else {
  		req.body.device = {};
  	}

  	var comm = {}
  	if (!req.body.device.hasOwnProperty("commid")) {
  		res.send("Missing communication id. " + ahref);
  	} else {
  		comm.comm = req.body.device.commid;
  	}

  	if (!req.body.device.hasOwnProperty("value")) {
  		res.send("Missing communication value. " + ahref);
  	}

  	if (!req.body.hasOwnProperty("content")) {
  		res.send("Missing message body. " + ahref);
  	} else {
  		comm.content = req.body.content;
  	}

  	comm.client = clid;
  	comm.read = true;

		var client = require("twilio")(ACCOUNT_SID, AUTH_TOKEN);
		client.messages.create({
	    body: comm.content,
	    to: req.body.device.value,
	    from: TWILIO_NUM
		}, function(err, message) {
			if (err) {
				res.send("There was an error. " + ahref + "<br>" + err);
			} else {
				comm.tw_sid = message.sid;
				comm.tw_status = message.status;
		  	db("msgs").insert(comm).then(function (client) {
		  		res.redirect("/cm/" + clid);
		  	});
			}
		});
  });



  app.get("/fail", function (req, res) { res.send("Bad entry.") });

};
