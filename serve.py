#!/usr/bin/env python3
"""Start the Tetris web game on this Mac and its local network."""
import argparse
import errno
from functools import partial
from http.client import HTTPConnection, HTTPException
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import webbrowser

BASE = Path(__file__).resolve().parent
FIRST_PORT = 8896
SERVER_NAME = "Tetris-Dendy/1"


class GameHandler(SimpleHTTPRequestHandler):
    server_version = SERVER_NAME

    def send_head(self):
        path = Path(self.translate_path(self.path)).resolve()
        if not path.is_relative_to(BASE) or any(part.startswith(".") for part in path.relative_to(BASE).parts):
            self.send_error(404)
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def already_serving(port):
    connection = HTTPConnection("127.0.0.1", port, timeout=1)
    try:
        connection.request("HEAD", "/game.nes")
        reply = connection.getresponse()
        return reply.status == 200 and reply.getheader("Server", "").startswith(SERVER_NAME + " ")
    except (OSError, HTTPException):
        return False
    finally:
        connection.close()


def wifi_address():
    interfaces = subprocess.run(
        ["/usr/sbin/networksetup", "-listallhardwareports"],
        capture_output=True, text=True
    ).stdout.split("\n\n")
    # Prefer the wireless adapter even when a VPN is the default route.
    for block in sorted(interfaces, key=lambda item: "Wi-Fi" not in item):
        for line in block.splitlines():
            if line.startswith("Device: "):
                result = subprocess.run(
                    ["/usr/sbin/ipconfig", "getifaddr", line[8:]],
                    capture_output=True, text=True
                )
                if result.returncode == 0 and result.stdout.strip():
                    return result.stdout.strip()
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--open", action="store_true")
    args = parser.parse_args()
    handler = partial(GameHandler, directory=str(BASE))
    server = None
    for port in range(FIRST_PORT, FIRST_PORT + 100):
        try:
            server = ThreadingHTTPServer(("0.0.0.0", port), handler)
            break
        except OSError as error:
            if error.errno != errno.EADDRINUSE:
                raise
            if already_serving(port):
                break
    else:
        raise SystemExit("Не удалось найти свободный порт.")

    url = f"http://localhost:{port}/"
    print(f"На Mac     {url}", flush=True)
    address = wifi_address()
    if address:
        print(f"На телефоне в той же сети Wi-Fi     http://{address}:{port}/", flush=True)
    if args.open:
        webbrowser.open(url)
    if server:
        print("Чтобы остановить сервер, нажмите Ctrl+C.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()


if __name__ == "__main__":
    main()
