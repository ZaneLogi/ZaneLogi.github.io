from binary_reader import BinaryReader
from bit_reader import BitReader
from bit_writer import BitWriter


class UnpackFilePart:
    def __init__(self, file_reader: BinaryReader):
        self.offset = 0
        self.initial_buffer_len = 0
        self.checksum = 0
        self.decompressed_size = 0
        self.compressed_size = 0
        self.unknown0 = 0
        self.unknown1 = 0
        self.index = 0

        self.file_reader = file_reader
        self.unpacking_done = False

    def log(self, message):
        print(f"[UnpackFilePart] {message}")

    def debug(self, message):
        print(f"[UnpackFilePart][DEBUG] {message}")

    def unpack(self) -> BinaryReader:
        if not self.unpacking_done:
            self.file_reader = self._do_unpacking(self.file_reader)
            self.unpacking_done = True
            return self.file_reader

        # 返回同樣的 buffer 但是新的 BinaryReader 物件
        return BinaryReader(self.file_reader)

    def _do_unpacking(self, file_reader: BinaryReader) -> BinaryReader:
        bit_reader = BitReader(file_reader, self.offset, self.compressed_size, self.initial_buffer_len)
        out_buffer = BitWriter(bit_reader, self.decompressed_size)

        while not out_buffer.eof() and not bit_reader.eof():
            if bit_reader.read(1) == 0:
                if bit_reader.read(1) == 0:
                    out_buffer.copy_raw_data(bit_reader.read(3) + 1)
                else:
                    out_buffer.copy_referenced_data(2, 8)
            else:
                opcode = bit_reader.read(2)
                if opcode == 0:
                    out_buffer.copy_referenced_data(3, 9)
                elif opcode == 1:
                    out_buffer.copy_referenced_data(4, 10)
                elif opcode == 2:
                    out_buffer.copy_referenced_data(bit_reader.read(8) + 1, 12)
                elif opcode == 3:
                    out_buffer.copy_raw_data(bit_reader.read(8) + 9)

        if self.checksum == bit_reader.get_current_checksum():
            self.debug(f"doUnpacking({file_reader.file_name}) done!")
        else:
            self.log(f"doUnpacking({file_reader.file_name}) : Checksum mismatch!")

        return out_buffer.get_file_reader(f"{file_reader.file_name}[{self.index}]")
