// queue.js
const Bull = require("bull");
const redisUrl ="redis://default:rdWasgZC9fMpsERlTEjU3GqBWIvCeZG3@redis-15657.c263.us-east-1-2.ec2.cloud.redislabs.com:15657";

const qrQueue = new Bull("qr generation", redisUrl);

module.exports = qrQueue;
