'use strict';

if (process.env.CCENV && process.env.CCENV == "production") {
  console.log("Production env. New Relic running.");
  require("newrelic");
}

// SECRET STUFF
const credentials = require("../credentials");
const SESS_SECRET = credentials.sessionSecret;

// APP INITIATE
const express = require("express");
const app = express();
const db  = require("./db");

// APP DEPENDENCIES
const bodyParser = require('body-parser');
const cookieParser = require("cookie-parser");
const session = require("cookie-session");
const flash = require("connect-flash");
const colors = require("colors");

// CONFIGURATION 1
app.set("view engine", "ejs");
app.use("/static", express.static("public"));
app.use("/components", express.static("bower_components"));
app.use("/modules", express.static("node_modules"));
app.use(cookieParser());

// PASSPORT SESSIONS, USERS
const bcrypt = require("bcrypt-nodejs");
const passport = require("passport");
require("./passport")(passport);

// CONFIGURATION 2
app.use(bodyParser.urlencoded({extended:true}));
app.use(bodyParser.json());

app.use(flash());
app.use(session({
  keys: [SESS_SECRET],
  name: 'CC_session',
}));

app.use(passport.initialize());
app.use(passport.session());

// Middleware
const middleware = require('./middleware');
app.use(middleware.logging);
app.use(middleware.attachErrorHandlers);
app.use(middleware.templateHelpers);
app.use(middleware.fetchUserAlertsFeed);
app.use(middleware.fetchUserOrganization);
app.use(middleware.fetchUserDepartment);
app.use(middleware.fetchClient);

app.use("/org", middleware.setLevelForOrg);

// UTILITIES
const auth = require('./lib/pass')

// TO DEPRECATE: Always run before routes
require("../routes/request-defaults")(app);

// Twilio-facing routes
// require("../routes/sms")(app);
// require("../routes/voice")(app);

const rootController = require('./controllers/root');
const clientsController = require('./controllers/clients');
const departmentsController = require('./controllers/departments');
const accessController = require('./controllers/access');
const usersController = require('./controllers/users');
const dashboardController = require('./controllers/dashboard');
const templatesController = require('./controllers/templates');

app.get("/", rootController.index);

app.get("/login", accessController.login);
app.post(/\/(login|login-fail)/, 
  passport.authenticate("local-login", {
    successRedirect: "/",
    failureRedirect: "/login-fail"
  })
);
app.get("/login-fail", accessController.loginFail);
app.get("/logout", auth.isLoggedIn, accessController.logout);
app.get("/login/reset", accessController.reset);
app.post("/login/reset", accessController.resetSubmit);
app.get("/login/reset/:uid", accessController.resetSpecific);
app.post("/login/reset/:uid", accessController.resetSpecficSubmit);

// app.use("/", require("../../routes/user"));
// app.use("/", require("../../routes/org"));

app.get("/colors", ColorsController.index);
app.post("/colors", ColorsController.update);
app.get("/colors/:colorID/remove", ColorsController.destroy);

app.get("/notifications", NotificationsController.index);
app.get("/notifications/create", NotificationsController.new);
app.get("/notifications/create/compose", NotificationsController.compose);
app.post("/notifications/create/compose", NotificationsController.composeCreate);
app.get("/notifications/create/templates", NotificationsController.templates);
app.post("/notifications/create", NotificationsController.create);
app.get("/notifications/:notificationID/edit", NotificationsController.edit);
app.post("/notifications/:notificationID/edit", NotificationsController.update);
app.get("/notifications/:notificationID/remove", NotificationsController.destroy);

app.get("/templates", TemplatesController.index);
app.get("/templates/create", TemplatesController.new);
app.post("/templates/create", TemplatesController.create);
app.get("/templates/remove/:templateID", TemplatesController.destroy);
app.get("/templates/edit/:templateID", TemplatesController.edit);
app.post("/templates/edit/:templateID", TemplatesController.update);

app.get("/groups", GroupsController.index);
app.get("/groups/create", GroupsController.new);
app.post("/groups/create", GroupsController.create);
app.get("/groups/edit/:groupID", GroupsController.edit);
app.post("/groups/edit/:groupID", GroupsController.update);
app.get("/groups/remove/:groupID", GroupsController.destroy);
app.get("/groups/activate/:groupID", GroupsController.activate);
app.get("/groups/address/:groupID", GroupsController.address);
app.post("/groups/address/:groupID", GroupsController.addressUpdate);

app.get("/org/clients", dashboardController.orgIndex);

app.get("/org/users", usersController.index);
app.get("/org/users/create", usersController.new);
app.post("/org/users/create", usersController.create);
app.get("/org/users/create/check/:email", usersController.check);
app.get("/org/users/:targetUserID/alter/:case", usersController.alter);
app.get("/org/users/:targetUser/edit", usersController.edit);
app.post("/org/users/:targetUser/edit", usersController.update);
app.get("/org/users/:targetUser/transfer", usersController.transferIndex);
app.post("/org/users/:targetUser/transfer", usersController.transferUpdate);

app.get("/org/departments", departmentsController.index);
app.get("/org/departments/create", departmentsController.new);
app.post("/org/departments/create", departmentsController.create);
app.get("/org/departments/:departmentId/edit", departmentsController.edit);
app.post("/org/departments/:departmentId/edit", departmentsController.update);
app.get("/org/departments/:departmentId/supervisors", 
  departmentsController.supervisorsIndex);
app.post("/org/departments/:departmentId/supervisors", 
  departmentsController.supervisorsUpdate);
app.get("/org/departments/:departmentID/alter/:case", 
  departmentsController.alter);

app.get("/org/clients", clientsController.index);
app.get("/org/clients/create", clientsController.new);
app.post("/org/clients/create", clientsController.create);


// Redundant catch all
app.get("/*", (req, res) => {
  res.notFound();
});


module.exports = app;