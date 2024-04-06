import paramiko
import time
import os
import time
import datetime

def attempt_sftp_connection(hostname, port, username, password):
    try:
        with paramiko.Transport((hostname, port)) as transport:
            transport.connect(username=username, password=password)
            sftp = paramiko.SFTPClient.from_transport(transport)
            print(f"{datetime.datetime.fromtimestamp(time.time()).strftime('%Y-%m-%d %H:%M:%S')} - SFTP connection to {hostname}:{port} succeeded.")
            sftp.close()
    except Exception as e:
        print(f"{datetime.datetime.fromtimestamp(time.time()).strftime('%Y-%m-%d %H:%M:%S')} - SFTP connection to {hostname}:{port} failed: {e}")
        os.system('say "Connection failed"')  # Use text-to-speech to indicate failure

def main():
    hostname = input("Enter the hostname: ")
    port = int(input("Enter the port (default 22): ") or "22")
    username = input("Enter the username: ")
    password = input("Enter the password: ")

    while True:
        attempt_sftp_connection(hostname, port, username, password)
        time.sleep(30)  # Wait for 30 seconds before trying again

if __name__ == "__main__":
    main()

