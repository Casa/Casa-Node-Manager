function getLanIPAddress() {
  var os = require('os');
  var ifaces = os.networkInterfaces();

  let ipv4;

  // Return undefined if the interface is down or not available.
  if (!Object.prototype.hasOwnProperty.call(ifaces, 'eth0')) {
    return undefined;
  }

  for (const config of ifaces.eth0) {
    if (config.family === 'IPv4') {
      ipv4 = 'http://' + config.address;
    }
  }

  // The first time the this ip address strategy is preformed, the manager will still be running on its own docker
  // network. This means it will think it's ip address is a docker address which always looks like '172.x.y.z'. We will
  // check for that and use the default DEVICE_HOST env variable in that case.
  //
  // In the future this could be resolved if the startup function in the manager can recreate itself of offload yml
  // management to a service closer to the operating system, potentially a new linux service.
  if (ipv4.startsWith('http://172.')) {
    return process.env.DEVICE_HOST;
  }

  return ipv4;
}

module.exports = {
  getLanIPAddress,
};
