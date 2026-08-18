const express = require('express');
const cors    = require('cors');
const routes  = require('./routes');
const errorHandler = require('./shared/middlewares/errorHandler');

const app = express();

app.use(cors());
app.use(express.json({
  // Save the raw Buffer before JSON.parse() so webhook signature verification
  // (which needs the exact bytes Razorpay signed) can access req.rawBody.
  // This has no effect on non-webhook routes.
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

app.use('/api', routes);

app.use(errorHandler);

module.exports = app;