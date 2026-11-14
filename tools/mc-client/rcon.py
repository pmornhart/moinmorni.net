#!/usr/bin/env python3
"""Mini-RCON-Client für Tests: python3 rcon.py host:port passwort "befehl" ["befehl" …]"""
import socket, struct, sys


def packet(rid, kind, body):
    data = struct.pack('<ii', rid, kind) + body.encode('utf-8') + b'\x00\x00'
    return struct.pack('<i', len(data)) + data


def read(sock):
    size = struct.unpack('<i', sock.recv(4))[0]
    data = b''
    while len(data) < size:
        data += sock.recv(size - len(data))
    rid, kind = struct.unpack('<ii', data[:8])
    return rid, data[8:-2].decode('utf-8', 'replace')


def run(addr, password, commands):
    host, port = addr.rsplit(':', 1)
    with socket.create_connection((host, int(port)), timeout=15) as s:
        s.sendall(packet(1, 3, password))
        if read(s)[0] == -1:
            raise SystemExit('RCON: falsches Passwort')
        out = []
        for i, cmd in enumerate(commands, start=2):
            s.sendall(packet(i, 2, cmd))
            out.append(read(s)[1])
        return out


if __name__ == '__main__':
    for line in run(sys.argv[1], sys.argv[2], sys.argv[3:]):
        print(line)
