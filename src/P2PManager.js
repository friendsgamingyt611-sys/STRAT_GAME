/**
 * P2PManager.js — Shoot Or Shield
 * Encapsulates PeerJS networking, messaging, and connection lifecycles.
 */
import { Storage } from './Storage.js';

export class P2PManager {
  constructor(ui) {
    this.ui = ui;
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.lobbyState = 'idle'; // 'idle' | 'waiting' | 'connected'
    
    // Connection State
    this.roomCode = null;
    this.localStart = false;
    this.remoteStart = false;
    this.localMove = null;
    this.remoteMove = null;
    this.localReady = false;
    this.opponentReady = false;
    this.localReadyRestart = false;
    this.opponentReadyRestart = false;
    this.historyRecorded = false;
  }

  initHost(localNickname, onOpen, onConnection, onError) {
    this.disconnect();
    this.isHost = true;
    this.lobbyState = 'waiting';

    const code = Math.floor(1000 + Math.random() * 9000).toString();
    this.peer = new Peer('sos-room-' + code);

    this.peer.on('open', () => {
      this.roomCode = code;
      onOpen(code);
    });

    this.peer.on('connection', (conn) => {
      this.conn = conn;
      this._setupConnection(conn, localNickname, onConnection);
    });

    this.peer.on('error', (err) => {
      onError(err);
    });
  }

  joinRoom(code, localNickname, onOpen, onConnection, onError) {
    this.disconnect();
    this.isHost = false;
    this.lobbyState = 'waiting';

    this.peer = new Peer();

    this.peer.on('open', () => {
      onOpen(code);
      const conn = this.peer.connect('sos-room-' + code);
      this.conn = conn;
      this._setupConnection(conn, localNickname, onConnection);
    });

    this.peer.on('error', (err) => {
      onError(err);
    });
  }

  _setupConnection(conn, localNickname, onConnection) {
    // Unbind any previous connection events
    conn.off('open');
    conn.off('data');
    conn.off('close');
    conn.off('error');

    conn.on('open', () => {
      this.localStart = false;
      this.remoteStart = false;
      this.localMove = null;
      this.remoteMove = null;
      this.localReady = false;
      this.opponentReady = false;
      this.localReadyRestart = false;
      this.opponentReadyRestart = false;
      this.lobbyState = 'connected';

      // Send local nickname
      conn.send({ type: 'NICKNAME', nickname: localNickname });
      onConnection(conn);
    });

    conn.on('data', (data) => {
      this.ui.handleP2PMessage(data);
    });

    conn.on('close', () => {
      this.ui.handleP2PDisconnect();
    });

    conn.on('error', () => {
      this.ui.handleP2PDisconnect();
    });
  }

  send(data) {
    if (this.conn) {
      try {
        this.conn.send(data);
      } catch (err) {
        console.error("Error sending P2P message:", err);
      }
    }
  }

  disconnect() {
    this.localStart = false;
    this.remoteStart = false;
    
    if (this.conn) {
      try {
        this.conn.send({ type: 'DISCONNECT' });
      } catch (e) {}
      try {
        this.conn.off('open');
        this.conn.off('data');
        this.conn.off('close');
        this.conn.off('error');
        this.conn.close();
      } catch (e) {}
      this.conn = null;
    }

    if (this.peer) {
      try {
        this.peer.off('open');
        this.peer.off('connection');
        this.peer.off('error');
        this.peer.destroy();
      } catch (e) {}
      this.peer = null;
    }

    this.lobbyState = 'idle';
  }
}
