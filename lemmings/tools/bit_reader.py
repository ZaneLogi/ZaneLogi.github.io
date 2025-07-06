from binary_reader import BinaryReader


class BitReader:
    def __init__(self, file_reader, offset, length, init_buffer_length):
        # 建立 BinaryReader 的副本（子視圖）
        self.bin_reader = BinaryReader(file_reader, offset, length, file_reader.file_name)

        self.pos = length - 1  # 對應 JS: this.pos = length; this.pos--;
        self.buffer = self.bin_reader.read_byte(self.pos)
        self.buffer_len = init_buffer_length
        self.checksum = self.buffer

    def get_current_checksum(self):
        """回傳目前為止讀取資料的 checksum"""
        return self.checksum

    def read(self, bit_count):
        """讀取指定數量的位元，回傳整數值"""
        result = 0

        for _ in range(bit_count):
            if self.buffer_len <= 0:
                self.pos -= 1
                if self.pos < 0:
                    raise EOFError("BitReader: Attempted to read past beginning of data")

                b = self.bin_reader.read_byte(self.pos)
                self.buffer = b
                self.checksum ^= b
                self.buffer_len = 8

            self.buffer_len -= 1
            result = (result << 1) | (self.buffer & 1)
            self.buffer >>= 1

        return result

    def eof(self):
        """判斷是否已讀完所有位元"""
        return self.buffer_len <= 0 and self.pos < 0
