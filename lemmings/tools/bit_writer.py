from binary_reader import BinaryReader
from bit_reader import BitReader


class BitWriter:
    def __init__(self, bit_reader: BitReader, out_length: int):
        self.out_data = bytearray(out_length)
        self.out_pos = out_length
        self.bit_reader = bit_reader

    def log(self, msg):
        print(f"[BitWriter] {msg}")

    def copy_raw_data(self, length: int):
        """從 bitReader 讀取指定 byte 數據（每次 8 bits），反向寫入 out_data"""
        if self.out_pos - length < 0:
            self.log("copyRawData: out of out buffer")
            length = self.out_pos  # 補救措施
            return

        for _ in range(length):
            self.out_pos -= 1
            self.out_data[self.out_pos] = self.bit_reader.read(8)

    def copy_referenced_data(self, length: int, offset_bit_count: int):
        """從已寫入的資料中，以 offset 複製指定 bit 數據"""
        offset = self.bit_reader.read(offset_bit_count) + 1

        if self.out_pos + offset > len(self.out_data):
            self.log("copyReferencedData: offset out of range")
            offset = 0
            return

        if self.out_pos - length < 0:
            self.log("copyReferencedData: out of out buffer")
            length = self.out_pos
            return

        for _ in range(length):
            self.out_pos -= 1
            self.out_data[self.out_pos] = self.out_data[self.out_pos + offset]

    def get_file_reader(self, filename: str) -> BinaryReader:
        """將寫入的結果轉換為 BinaryReader"""
        return BinaryReader(self.out_data, None, None, filename)

    def eof(self) -> bool:
        return self.out_pos <= 0
