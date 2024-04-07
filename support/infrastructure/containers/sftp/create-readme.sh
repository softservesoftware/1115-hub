#!/bin/bash
echo "Debug: QE_NAMES='$QE_NAMES', TAG='$TAG', DATE='$DATE', INTERVAL='$INTERVAL'"

# Ensure that QE_NAMES, version, date, and interval_seconds variables are provided
if [[ -z "$QE_NAMES" || -z "$TAG" || -z "$DATE" || -z "$INTERVAL" ]]; then
    echo "Environment variables QE_NAMES, TAG, DATE, and INTERVAL must be set."
    exit 1
fi

# Iterate over the QE_NAMES, treating it as a space-separated list
IFS=' ' read -r -a qe_names_array <<< "$QE_NAMES"

for qe_name in "${qe_names_array[@]}"; do
    # Define the output directory and create it if it doesn't exist
    output_dir="/home/$qe_name"
    mkdir -p "$output_dir"
    # this will get recreated by sftp startup (fingers crossed)
    rm -rf "$output_dir/ingress"

    # Process the template and replace variables
    sed "s/\${QE_NAME}/$qe_name/g; s/\${TAG}/$TAG/g; s/\${DATE}/$DATE/g; s/\${INTERVAL}/$INTERVAL/g" /README-template.md > "$output_dir/README.md"
done

echo "README files have been created."