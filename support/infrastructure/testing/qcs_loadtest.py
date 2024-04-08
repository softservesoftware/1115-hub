import paramiko
import os
import time

def scp_files(local_dir, remote_dir, hostname, username, password, time_interval=10, port=22, batch_size=1, log_file=None):
    ssh_client = paramiko.SSHClient()
    ssh_client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    files_in_dir = os.listdir(local_dir)
    total_files = len(files_in_dir) * batch_size

    try:
        ssh_client.connect(hostname, port, username, password)
        with ssh_client.open_sftp() as sftp_client:
            files_sent = 0
            test_number = 1  # Initialize test number
            for batch in range(batch_size):
                for filename in files_in_dir:
                    if files_sent >= total_files:
                        break  # Stop sending if we've met the batch size limit
                    try:
                        local_path = os.path.join(local_dir, filename)
                        timestamp = time.strftime("%Y%m%d%H%M%S")
                        # Append timestamp to the end of the file name, before the extension
                        name, ext = os.path.splitext(filename)
                        remote_filename = f"{name}_{timestamp}{ext}"
                        remote_path = os.path.join(remote_dir, remote_filename)
                        sftp_client.put(local_path, remote_path)
                        log_file.write(f"ok {test_number} - Successfully uploaded {filename}\n")
                        files_sent += 1
                    except Exception as e:
                        log_file.write(f"not ok {test_number} - Error uploading {filename}: {e}\n")
                    test_number += 1  # Increment test number for each file processed

    except Exception as e:
        log_file.write(f"not ok {test_number} - Connection error: {e}\n")
    finally:
        ssh_client.close()

def main():
    hostname = input("Hostname [synthetic.sftp.techbd.org]: ") or 'synthetic.sftp.techbd.org'
    username = input("Username [qcs-test-load]: ") or 'qcs-test-load'
    password = input("Password [secret]: ") or 'secret'
    port = int(input("Port [22]: ") or 22)
    local_dir = input("/path/to/local/directory: ") or '/path/to/local/directory'
    remote_dir = input("Remote directory [/ingress]: ") or '/ingress'
    time_interval = int(input("Interval between uploads in seconds [10]: ") or 1)
    batch_sizes_to_test = input("Batch sizes to test (comma separated, e.g. 10,25,50,100): ").split(',')

    with open("upload_test_results.tap", "w") as log_file:
        log_file.write("TAP version 14\n")
        for batch_size_str in batch_sizes_to_test:
            batch_size = int(batch_size_str)
            total_tests = len(os.listdir(local_dir)) * batch_size
            log_file.write(f"# Total tests for batch size {batch_size}: {total_tests}\n")
            scp_files(local_dir, remote_dir, hostname, username, password, time_interval, port, batch_size, log_file)
            time.sleep(time_interval)

if __name__ == "__main__":
    main()
