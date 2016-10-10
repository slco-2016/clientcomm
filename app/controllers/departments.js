const Conversations = require('../models/conversations');
const Departments = require('../models/departments');
const DepartmentSupervisors = require('../models/departmentSupervisors');
const PhoneNumbers = require('../models/phoneNumbers');
const Users = require('../models/users');


module.exports = {

  alter(req, res) {
    const state = req.params.case === 'close' ? false : true;

    Departments.findMembers(req.params.department)
    .then((members) => {
      if (members.length == 0) {
        Departments.alterCase(req.params.department, state)
        .then(() => {
          req.flash('success', 'Changed department activity status.');
          res.redirect('/org/departments');
        }).catch(res.error500);
      } else {
        req.flash('warning', 'Need to remove or close out members first.');
        res.redirect('/org/departments');
      }
    }).catch(res.error500);
  },

  create(req, res) {
    Departments.create(
                  req.user.org,    // organization
                  req.body.name,   // new dep't name
                  req.body.number, // associated number
                  req.user.cmid    // created by
    ).then(() => {
      req.flash('success', 'Made new department.');
      res.redirect('/org/departments');
    }).catch(res.error500);
  },
  
  edit(req, res) {
    const departmentId = req.params.department;
    const orgId = req.user.org;
    Departments.findById(departmentId)
    .then((department) => {
      if (department) {
        PhoneNumbers.findByOrgID(orgId)
        .then((phoneNumbers) => {
          res.render('departments/edit', {
            department: department,
            phoneNumbers: phoneNumbers,
          });
        }).catch(res.error500);

      } else {
        notFound(res);
      }
    }).catch(res.error500);
  },
  
  index(req, res) {
    const status = req.query.status === 'inactive' ? false : true;

    Departments.findByOrg(req.user.org, status)
    .then((departments) => {
      res.render('departments/index', {
        hub: {
          tab: 'departments',
          sel: status ? 'active' : 'inactive',
        },
        departments: departments,
      });
    }).catch(res.error500);
  },
  
  new(req, res) {
    PhoneNumbers.findByOrgID(req.user.org)
    .then((phoneNumbers) => {
      res.render('departments/create', {
        phoneNumbers: phoneNumbers,
      });
    }).catch(res.error500);
  },
  
  supervisorsIndex(req, res) {
    let supervisors;
    DepartmentSupervisors.findByDepartmentIDs(req.params.department)
    .then((s) => {
      supervisors = s;
      return Users.findByOrg(req.user.org);
    }).then((users) => {

      // Limit options to only users already added to the department
      // "Promote from within" concept
      const members = users.filter(function (u) {
        return Number(u.department) == Number(req.params.department);
      });

      res.render('departments/supervisors', {
        departmentId: req.params.department,
        supervisors: supervisors,
        members: members,
      });
    }).catch(res.error500);
  },
  
  supervisorsUpdate(req, res) {
    if (!Array.isArray(req.body.supervisorIds)) req.body.supervisorIds = [req.body.supervisorIds,];

    DepartmentSupervisors.updateSupervisors(
      req.params.department, 
      req.body.supervisorIds, 
      req.body.revertClass
    ).then(() => {
      req.flash('success', 'Updated department supervisors.');
      res.redirect('/org/departments');
    }).catch(res.error500);
  },

  update(req, res) {
    Departments.editOne(
      req.params.department, // department
      req.body.name,           // new name
      req.body.number          // new associated number
    ).then(() => {
      req.flash('success', 'Updated department.');
      res.redirect('/org/departments');
      return null;
    }).catch(res.error500);
  },

};