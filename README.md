# Intro

**transparent-proxy** extends the native [net.createServer](https://nodejs.org/api/net.html#net_net_createserver_options_connectionlistener) and it acts as a **real** transparent http-proxy.

This module was built on top of TCP-level to avoid header-stripping problem of nodejs http(s)-modules. 

It allows to upstream client-request dynamically to other proxies, or to certain iFace, and more...

It supports [Basic Proxy-Authentication](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Proxy-Authorization).


# Quick Start

## Install

```bash
npm i transparent-proxy
```


## Use

```javascript
const ProxyServer = require('transparent-proxy');

//init ProxyServer
const server = new ProxyServer();

//starting server on port 8080
server.listen(8080, '0.0.0.0', function () {
    console.log('TCP-Proxy-Server started!', server.address());
});
```



## Options Object

| Param  | Type                | Description  |
| ------ | ------------------- | ------------ |
|options | <code>Object</code> |  The options object. |
|[options.auth] | <code>Function</code> |  Activate/Handle Proxy-Authentication. Returns or solves to Boolean. |
|[options.upstream] | <code>Function</code> |  The proxy to be used to upstreaming requests. Returns String. |
|[options.tcpOutgoingAddress] | <code>Function</code> |  The localAddress to use while sending requests. Returns String |
|[options.injectData] | <code>Function</code> |  The edited data to upstream. Returns Buffer or string |
|[options.injectResponse] | <code>Function</code> |  The edited response to return to connected client. Returns Buffer or string |
|[options.keys] | <code>Function</code> |  The keys to use while handshake. It will work only if intercept is true. Returns Object or false |
|[options.verbose] | <code>Boolean</code> |  Activate verbose mode. |
|[options.intercept] | <code>Boolean</code> |  Activate interception of encrypted communications. False as default. |



## `upstream`, `tcpOutgoingAddress`, `injectData` & `injectResponse` Options

The options are functions having follow parameters:

| Param  | Type                | Description  |
| ------ | ------------------- | ------------ |
|data | <code>Buffer</code> |  The received data. |
|session | <code>Session</code> |  Object containing info/data about Tunnel |


- upstream-Function need to return/resolve a String with format -> `IP:PORT` or `USER:PWD@IP:PORT` of used http-proxy. If *'localhost'* is returned/resolved, then the host-self will be used as proxy.
- tcpOutgoingAddress-Function need to return a String with format -> `IP`. 

*Note*: These functions will be executed before first tcp-socket-connection is established.


- injectData-Function need to return a String or buffer for the new spoofed data. This will be upstreamed as request. 
- injectResponse-Function need to return a String or buffer for the new received data. 


## Upstream to other proxies

If you don't want to use the host of active instance self, then you need to upstream connections to another http-proxy.
This can be done with `upstream` attribute.

```javascript
const ProxyServer = require('transparent-proxy');

const server = new ProxyServer({
    upstream: function () {
          return 'x.x.x.x:3128'; // upstream to other proxy
    }
});

//starting server on port 8080
server.listen(8080, '0.0.0.0', function () {
    console.log('TCP-Proxy-Server started!', server.address());
});
```

You can also use an async function to upstream your requests:

```javascript
const ProxyServer = require('transparent-proxy');

const server = new ProxyServer({
    upstream: async function () {
         //make some async task before
         return 'x.x.x.x:3128'; // upstream to other proxy
    }
});

//starting server on port 8080
server.listen(8080, '0.0.0.0', function () {
    console.log('TCP-Proxy-Server started!', server.address());
});
```


## The `auth` Function

This activate basic authorization mechanism.
The Auth-function will be executed while handling Proxy-Authentications.


 
| Param  | Type                | Description  |
| ------ | ------------------- | ------------ |
|username | <code>String</code> |  The client username. |
|password | <code>String</code> |  The client password |
|session | <code>Session</code> |  Object containing info/data about Tunnel |



*Note*: It needs to return True/False or a **Promise** that resolves to boolean (*isAuthenticated*).


```javascript
const ProxyServer = require('transparent-proxy');

const server = new ProxyServer({
    auth: function (username, password) {
        return username === 'bar' && password === 'foo';
    }
});

//starting server on port 8080
server.listen(8080, '0.0.0.0', function () {
    console.log('TCP-Proxy-Server started!', server.address());
});
```


## Interception

The callbacks `injectData` & `injectResponse` could be used to intercept/spoof communication.
These functions are executed with the `data` and `session` arguments.

#### Intercepting HTTPS

The boolean attribute `intercept` allows to break SSL-Communication between Source & Destination.

This will activate Security-Alarm by most used browsers.


```javascript
const switchWith = 'My Super Spoofed UA!';
const server = new ProxyServer({
    intercept: true,
    verbose: true,
    injectData: (data, session) => {
        if (session.isHttps) {
            const modifiedData = data.toString()
                .replace(session.request.headers['user-agent'], switchWith); //replacing UA-Header-Value

            return Buffer.from(modifiedData);
        }
        return data;
    }
});
```

```bash
curl -x localhost:8080 -k http://ifconfig.io/ua
curl/7.83.1

curl -x localhost:8080 -k https://ifconfig.me/ua
My Super Spoofed UA!
```


## The `keys` Function

This function will work only if `intercept` is set to `true`. 

If activated needs to return an Object `{key:'String', cert:'String'}` like [native tls_connect_options.key & tls_connect_options.cert](https://nodejs.org/api/tls.html#tls_tls_connect_options_callback) or `false` statement. 

If no object is returned, then [default keys](https://github.com/gr3p1p3/transparent-proxy/blob/master/lib/constants.js#L56) will be used to update communication.


| Param  | Type                | Description  |
| ------ | ------------------- | ------------ |
|session | <code>Session</code> |  Object containing info/data about Tunnel |



*Note*: This function will be executed before TLS-Handshake.  


#### Session-Instance

The Session-Instance is an Object containing info/data about Tunnel.
It has following useful attributes and methods:

- isHttps - Is session encrypted.
- request - The Request-Object containing info about current request.
- response - The Response-Object containing info about current response.

- getTunnelStats() - Get Stats for this tunnel
- getId() - Get Own ID-Session
- isAuthenticated() - Is the session authenticated by user or not.


## .getBridgedConnections()

```javascript
const ProxyServer = require('transparent-proxy');
const server = new ProxyServer();

//starting server on port 8080
server.listen(8080, '0.0.0.0', function () {
    console.log('Proxy-Server started!', server.address());
});

setInterval(function showOpenSockets() {
    const bridgedConnections = server.getBridgedConnections();
    console.log([new Date()], 'OPEN =>', Object.keys(bridgedConnections).length)
}, 2000);
```



## Examples

This example upstreams only requests for ifconfig.me to another proxy, for all other requests will be used localhost.

```javascript
const ProxyServer = require('transparent-proxy');

const server = new ProxyServer({
    upstream: function (data, session) {
        if (~(data.toString().indexOf('ifconfig.me'))) {
            return 'x.x.x.x:3128'; // upstream to other proxy
        } else {
            return 'localhost'; //upstream to localhost
        }
    },
});

//starting server on port 8080
server.listen(8080, '0.0.0.0', function () {
    console.log('TCP-Proxy-Server started!', server.address());
});
```

Testing with `curl`:

```bash
curl -x 127.0.0.1:8080 https://ifconfig.me
x.x.x.x
```
```bash
curl -x 127.0.0.1:8080 https://ifconfig.co
y.y.y.y
```



For more examples [look here](https://github.com/gr3p1p3/transparent-proxy/tree/master/examples).
