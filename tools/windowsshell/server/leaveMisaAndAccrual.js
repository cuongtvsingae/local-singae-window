const { startLeaveMisaAccrualSchedulers } = require("./authStore");

function start() {
  startLeaveMisaAccrualSchedulers();
}

module.exports = { start };
