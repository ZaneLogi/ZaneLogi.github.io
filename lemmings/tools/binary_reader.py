class BinaryReader:
    def __init__(self, data=None, offset=0, length=None, filename='[unknown]'):
        self.file_name = filename
        self.log("Initializing BinaryReader")
        
        offset = offset if offset else 0

        if data is None:
            self.data = bytes()
            data_length = 0
            self.log('BinaryReader from NULL; size: 0')

        elif isinstance(data, BinaryReader):
            self.data = data.data
            data_length = len(self.data)
            self.log(f'BinaryReader from BinaryReader; size: {data_length}')

        elif isinstance(data, (bytes, bytearray)):
            self.data = bytes(data)
            data_length = len(self.data)
            self.log(f'BinaryReader from bytes; size: {data_length}')

        else:
            raise TypeError(f'Unsupported input type for BinaryReader: {type(data)}')

        if length is None:
            length = data_length - offset

        self.hidden_offset = offset
        self.length = length
        self.pos = self.hidden_offset

    def log(self, message):
        print(f"[BinaryReader] {message}")

    def read_byte(self, offset=None):
        if offset is not None:
            self.pos = offset + self.hidden_offset

        if self.pos < 0 or self.pos >= len(self.data):
            self.log(f'read out of data: {self.file_name} - size: {len(self.data)} @ {self.pos}')
            return 0

        value = self.data[self.pos]
        self.pos += 1
        return value

    def read_int(self, length=4, offset=-1):
        if offset < 0:
            offset = self.pos

        if offset + length > len(self.data):
            self.log(f'read_int out of bounds at offset {offset}')
            return 0

        if length == 4:
            value = (
                (self.data[offset] << 24) |
                (self.data[offset + 1] << 16) |
                (self.data[offset + 2] << 8) |
                self.data[offset + 3]
            )
            self.pos = offset + 4
            return value
        else:
            value = 0
            for i in range(length):
                value = (value << 8) | self.data[offset]
                offset += 1
            self.pos = offset
            return value

    def read_int_be(self, offset=None):
        if offset is None:
            offset = self.pos
        value = (
            self.data[offset] |
            (self.data[offset + 1] << 8) |
            (self.data[offset + 2] << 16) |
            (self.data[offset + 3] << 24)
        )
        self.pos = offset + 4
        return value

    def read_word(self, offset=-1):
        if offset < 0:
            offset = self.pos
        value = (self.data[offset] << 8) | self.data[offset + 1]
        self.pos = offset + 2
        return value

    def read_word_be(self, offset=-1):
        if offset < 0:
            offset = self.pos
        value = self.data[offset] | (self.data[offset + 1] << 8)
        self.pos = offset + 2
        return value

    def read_string(self, length, offset=-1):
        if offset >= 0:
            self.pos = offset + self.hidden_offset

        result = ''
        for _ in range(length):
            if self.pos >= len(self.data):
                break
            value = self.data[self.pos]
            self.pos += 1
            result += chr(value)
        return result

    def get_offset(self):
        return self.pos - self.hidden_offset

    def set_offset(self, new_pos):
        self.pos = new_pos + self.hidden_offset

    def eof(self):
        pos = self.pos - self.hidden_offset
        return pos >= self.length or pos < 0

    def read_all(self):
        return self.read_string(self.length, 0)
