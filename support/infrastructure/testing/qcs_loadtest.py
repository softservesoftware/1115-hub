import paramiko
import os
import time

def scp_files(local_dir, remote_dir, hostname, username, password, interval=10, port=22):
    ssh_client = paramiko.SSHClient()
    ssh_client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        ssh_client.connect(hostname, port, username, password)
        with ssh_client.open_sftp() as sftp_client:
            files_sent = 0
            for filename in os.listdir(local_dir):
                try:
                    local_path = os.path.join(local_dir, filename)
                    timestamp = time.strftime("%Y%m%d%H%M%S")
                    remote_filename = f"{timestamp}_{filename}"
                    remote_path = os.path.join(remote_dir, remote_filename)
                    sftp_client.put(local_path, remote_path)
                    files_sent += 1
                except Exception as e:
                    print(f"{time.strftime('%Y-%m-%d %H:%M:%S')} - Error uploading {filename}: {e}")
                    continue  # Skip this file and continue with the next

            print(f"{time.strftime('%Y-%m-%d %H:%M:%S')} - Successfully uploaded {files_sent} files.")
    except Exception as e:
        print(f"{time.strftime('%Y-%m-%d %H:%M:%S')} - Connection error: {e}")
    finally:
        ssh_client.close()

def main():
    hostname = input("Hostname [mainEl-sftpS-Gg9V0m0B9M8E-8400acf179b033e2.elb.us-east-1.amazonaws.com]: ") or 'mainEl-sftpS-Gg9V0m0B9M8E-8400acf179b033e2.elb.us-east-1.amazonaws.com'
    username = input("Username [bronx]: ") or 'bronx'
    password = input("Password [pass]: ") or 'pass'
    port = int(input("Port [22]: ") or 22)
    local_dir = input("/path/to/local/directory: ") or '/path/to/local/directory'
    remote_dir = input("Remote directory [/ingress]: ") or '/ingress'
    interval = int(input("Interval between uploads in seconds [10]: ") or 10)

    while True:
        scp_files(local_dir, remote_dir, hostname, username, password, interval, port)
        time.sleep(interval)

if __name__ == "__main__":
    main()

