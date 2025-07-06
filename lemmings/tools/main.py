from binary_reader import BinaryReader
from file_container import FileContainer

def format_js_uint8array(data_bytes):
    lines = []
    # 每行 16 個 bytes，格式為 0xXX
    for i in range(0, len(data_bytes), 16):
        chunk = data_bytes[i:i+16]
        hexes = ', '.join(f"0x{b:02X}" for b in chunk)
        lines.append(f"/*{i:04X}*/  {hexes},")
    return '\n'.join(lines)

# 讀入二進位檔案
with open("LEVEL000.DAT", "rb") as f:
    file_bytes = f.read()

# 放入 BinaryReader
reader = BinaryReader(file_bytes, filename="LEVEL000.DAT")

container = FileContainer(reader)

output_lines = []
output_lines.append("const container = [")

for i in range(container.count()):
    part = container.get_part(i)
    part.set_offset(0)
    part_data = [part.read_byte() for _ in range(part.length)]

    js_array = format_js_uint8array(part_data)
    output_lines.append(f"  // part {i}:")
    output_lines.append("  new Uint8Array([\n" + js_array + "\n  ]),\n")

output_lines.append("];")

with open("container.js", "w", encoding="utf-8") as f:
    f.write('\n'.join(output_lines))
