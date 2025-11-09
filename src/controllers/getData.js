// Example: controller or route handler function
const getData = (req, res) => {
  res.json({
    success: true,
    message: "Test data response successful!",
    data: {
      name: "Bidipta",
      role: "Developer",
      status: "Active"
    }
  });
};

module.exports = { getData };
