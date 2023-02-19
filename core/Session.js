const tls = require('tls');
const parseDataToObject = require('../lib/parseDataToObject');
const net = require('net');
const {EVENTS, DEFAULT_KEYS} = require('../lib/constants');
const {request, createServer} = require('http');
const {CLOSE, DATA, ERROR} = EVENTS;

/**
 * Write data of given socket
 * @param {net.Socket} socket
 * @param data
 */
function socketWrite(socket, data) {
    if (socket && !socket.destroyed && data) {
        socket.write(data);
    }
}

/**
 * Destroy the socket
 * @param {net.Socket} socket
 */
function socketDestroy(socket) {
    if (socket && !socket.destroyed) {
        socket.destroy();
    }
}

class Session extends Object {
    /**
     *
     * @param {string} id - The used ID.
     */
    constructor(id) {
        super();

        this._id = id;
        this._src = null;
        this._dst = null;
        this._tunnel = {};
        this.user = null;
        this.authenticated = false;
        this.isHttps = false;
    }

    /**
     * @param {buffer|string} data - The data to send.
     * @returns {Session}
     */
    clientRequestWrite(data) {
        socketWrite(this._dst, data);
        return this;
    }

    /**
     * @param {buffer|string} data - The data to send.
     * @returns {Session}
     */
    clientResponseWrite(data) {
        socketWrite(this._src, data);
        return this;
    }

    /**
     * Destroy existing sockets for this Session-Instance
     * @returns {Session}
     */
    destroy() {
        if (this._dst) {
            socketDestroy(this._dst);
        }
        if (this._src) {
            socketDestroy(this._src);
        }
        return this;
    }

    /**
     * Is Session authenticated by user
     * @returns {boolean}
     */
    isAuthenticated() {
        return this.authenticated;
    }

    setRequest(data) {
        return new Promise((resolve) => {
            createServer()
                .on('connect', resolve)
                .on('request', resolve)
                .emit('connection', this._srcMirror)
            this._srcMirror.emit('data', data)
        }).then(request => this.request = request)
    }

    setResponse(data) {
        return new Promise((resolve) => {
            this._setResponseResolver = resolve
            this._dstMirror.emit('data', data)
        }).then(response => this.response = response)
    }

    /**
     * Set the socket that will receive response
     * @param {net.Socket} socket
     * @returns {Session}
     */
    setResponseSocket(socket) {
        this._src = socket;
        this._srcMirror = new net.Socket()
        return this;
    }

    /**
     * Set the socket that will receive request
     * @param {net.Socket} socket
     * @returns {Session}
     */
    setRequestSocket(socket) {
        this._dst = socket;
        this._dstMirror = new net.Socket()
        request({ createConnection: () => this._dstMirror }, response => { this._setResponseResolver(response) });
        return this;
    }

    /**
     * Get own id
     * @returns {string}
     */
    getId() {
        return this._id;
    }

    /**
     * @param {string} username
     * @returns {Session}
     */
    setUserAuthentication(username) {
        if (username) {
            this.authenticated = true;
            this.user = username;
        }
        return this;
    }

    /**
     * @param {object} options
     * @returns {Session}
     */
    setTunnelOpt(options) {
        if (options) {
            const {host, port, upstream} = options;
            this._tunnel.ADDRESS = host;
            this._tunnel.PORT = port;
            if (!!upstream) {
                this._tunnel.UPSTREAM = upstream;
            }
        }
        return this;
    }

    /**
     * @param {object} callbacksObject
     * @param {Function} callbacksObject.onDataFromClient
     * @param {Function} callbacksObject.onDataFromUpstream
     * @param {Function} callbacksObject.onClose
     * @param {object} KEYS - {key:{string},cert:{string}}
     * @returns {Session}
     * @private
     */
    _updateSockets(callbacksObject, KEYS = DEFAULT_KEYS) {
        const {onDataFromClient, onDataFromUpstream, onClose} = callbacksObject;
        KEYS = KEYS || DEFAULT_KEYS;

        if (!this._updated) {
            const srcSocket = new tls.TLSSocket(this._src, {
                rejectUnauthorized: false,
                requestCert: false,
                isServer: true,
                key: KEYS.key,
                cert: KEYS.cert
            })
                .on(DATA, onDataFromClient)
                .on(CLOSE, onClose)
                .on(ERROR, onClose);

            this.setResponseSocket(srcSocket);

            const dstSocket = new tls.TLSSocket(this._dst, {
                rejectUnauthorized: false,
                requestCert: false,
                isServer: false
            })
                .on(DATA, onDataFromUpstream)
                .on(CLOSE, onClose)
                .on(ERROR, onClose);
            // https://github.com/nodejs/node/blob/7f7a899fa5f3b192d4f503f6602f24f7ff4ec57a/lib/_tls_wrap.js#L976
            // https://github.com/nodejs/node/blob/7f7a899fa5f3b192d4f503f6602f24f7ff4ec57a/lib/_tls_wrap.js#L1675-L1686
            dstSocket.setServername(this._dst._host || this._tunnel.UPSTREAM.host);
            this.setRequestSocket(dstSocket);
            this._updated = true;
        }
        return this;
    }

    /**
     * Get Stats for this tunnel
     * @returns {object} - {ADDRESS:'String', PORT:Number, UPSTREAM:{ADDRESS,PORT}}
     */
    getTunnelStats() {
        return this._tunnel;
    }
}

module.exports = Session;
