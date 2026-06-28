'use strict';

const net = require('net');
const EventEmitter = require('events');
const { createLogger } = require('../utils/logger');

/**
 * TcpServer handles incoming TCP connections from the Order Gateway.
 * It reads the stream, handles fragmentation by buffering, splits messages
 * by the newline character ('\n'), and parses them as JSON.
 * It emits 'message' events for each valid JSON object received.
 */
class TcpServer extends EventEmitter {
  /**
   * Initialize the TCP Server.
   * @param {number} port - The port number to listen on.
   */
  constructor(port) {
    super();
    this.port = port;
    this.logger = createLogger('TCP_SERVER');
    
    // Create the net server and bind the connection handler
    this.server = net.createServer(this.handleConnection.bind(this));

    // Handle server-level errors (e.g., port already in use)
    this.server.on('error', (err) => {
      this.logger.error(`TCP Server Error: ${err.message}`, { error: err.stack });
    });
  }

  /**
   * Starts the TCP server.
   * @returns {Promise<void>} Resolves when the server is listening.
   */
  start() {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        this.logger.info(`TCP Server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Stops the TCP server.
   * @returns {Promise<void>} Resolves when the server is closed.
   */
  stop() {
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) return reject(err);
        this.logger.info('TCP Server stopped');
        resolve();
      });
    });
  }

  /**
   * Handles a new TCP connection from a client (Gateway).
   * @param {net.Socket} socket - The connected socket.
   */
  handleConnection(socket) {
    const clientAddress = `${socket.remoteAddress}:${socket.remotePort}`;
    this.logger.info(`New connection established`, { client: clientAddress });

    let buffer = '';

    // Handle incoming data
    socket.on('data', (data) => {
      // Append new data to the buffer to handle network fragmentation
      buffer += data.toString('utf-8');

      let newlineIndex;
      // Process all complete messages found in the buffer
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        // Extract the message string up to the newline
        const messageStr = buffer.slice(0, newlineIndex);
        // Remove the processed message and the newline from the buffer
        buffer = buffer.slice(newlineIndex + 1);

        // Ignore empty lines
        if (messageStr.trim().length === 0) {
          continue;
        }

        let parsedJson;
        try {
          parsedJson = JSON.parse(messageStr);
        } catch (error) {
          this.logger.error('Failed to parse incoming message as JSON', { 
            messageSnippet: messageStr.substring(0, 50),
            error: error.message 
          });

          // Requirement 3.3 / 5.1: If invalid JSON, do not crash, send error response
          const errorResponse = { 
            requestId: null, 
            status: "error", 
            reason: "invalid_json" 
          };
          this.sendResponse(socket, errorResponse);
          continue; // Move to the next message in the buffer
        }

        // Define a reply function tied to this socket for the event listener to use
        const reply = (responseObj) => {
          this.sendResponse(socket, responseObj);
        };

        // Emit the message for the Inventory Coordinator to handle
        this.emit('message', parsedJson, reply);
      }
    });

    // Handle connection closure
    socket.on('close', () => {
      this.logger.info(`Connection closed`, { client: clientAddress });
      // Emit close event so index.js could theoretically clean up if it tracks connections
      this.emit('close', socket);
    });

    // Handle socket errors gracefully without crashing the server
    socket.on('error', (err) => {
      this.logger.error(`Socket error`, { client: clientAddress, error: err.message });
      if (!socket.destroyed) {
        socket.destroy();
      }
    });
  }

  /**
   * Helper method to serialize and send a JSON response with a newline terminator.
   * @param {net.Socket} socket - The socket to write to.
   * @param {object} responseObj - The response object to send.
   */
  sendResponse(socket, responseObj) {
    if (!socket.destroyed && socket.writable) {
      try {
        const responseStr = JSON.stringify(responseObj) + '\n';
        socket.write(responseStr);
      } catch (err) {
        this.logger.error(`Failed to stringify response object`, { error: err.message });
      }
    }
  }
}

module.exports = TcpServer;
