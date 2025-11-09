const express = require('express');
const router = express.Router();
const { getData } = require("../controllers/getData")


router.get("/web-agency/get-all-data", getData)



module.exports = router;