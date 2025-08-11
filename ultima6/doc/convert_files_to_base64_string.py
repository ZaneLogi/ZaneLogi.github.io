import base64
import sys
import os

def bin_to_base64_js(input_path, output_path=None, var_name=None):
    with open(input_path, "rb") as f:
        binary_data = f.read()

    if not output_path:
        output_path = os.path.splitext(input_path)[0] + ".js"

    if not var_name:
        var_name = os.path.basename(input_path).replace('.', '_')

    b64 = base64.b64encode(binary_data).decode('ascii')

    with open(output_path, "w", encoding="utf-8") as out:
        out.write(f"// Auto-generated from {input_path}\n\n")
        out.write(f"const {var_name}_base64 = \\\n")
        # Split into multiple lines for readability
        line_length = 76
        for i in range(0, len(b64), line_length):
            out.write(f"  \"{b64[i:i+line_length]}\" +\n")
        out.write("  \"\";\n\n")
        out.write(f"""function base64ToUint8Array(base64) {{
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {{
    bytes[i] = binary.charCodeAt(i);
  }}
  return bytes;
}}

const {var_name} = base64ToUint8Array({var_name}_base64);
""")

    print(f"✅ Wrote Base64-encoded JS to {output_path} as `{var_name}_base64`")

# Example usage:
# bin_to_base64_js("maptiles.vga")
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python bin2b64js.py <input_file> [output_file.js] [var_name]")
    else:
        bin_to_base64_js(*sys.argv[1:])
