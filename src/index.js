const express = require("express");
const bodyParser = require("body-parser");
const route = require("./routes/route.js");
const { default: mongoose } = require("mongoose");
const app = express();
var cors = require("cors");
require("dotenv").config();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

mongoose
  .connect(process.env.DB_URL, {
    useNewUrlParser: true,
  })
  .then(() => console.log("MongoDB is connected"))
  .catch((err) => console.log(err));

app.use("/", route);

app.listen(process.env.PORT || 4000, function () {
  console.log("Express app running on port " + (process.env.PORT || 4000));
});