# binary_to_js_array_hex_16perline.py
input_file = "82s126.3m"
output_file = "output.js"
array_name = "binaryData"

with open(input_file, "rb") as f:
    binary_data = f.read()

# 轉為 0x 格式的十六進位字串
hex_array = [f"0x{byte:02X}" for byte in binary_data]

# 每行 16 個
array_str = f"const {array_name} = [\n"
for i in range(0, len(hex_array), 16):
    line = ", ".join(hex_array[i:i+16])
    array_str += f"  {line},\n"
array_str = array_str.rstrip(",\n") + "\n];\n"

# 寫入檔案
with open(output_file, "w") as f:
    f.write(array_str)

print(f"✅ 已輸出格式化 JS 陣列至 {output_file}")
