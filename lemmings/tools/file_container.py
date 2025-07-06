from binary_reader import BinaryReader
from unpack_file_part import UnpackFilePart


class FileContainer:
    def __init__(self, content: BinaryReader):
        self.parts = []
        self.read(content)

    def log(self, message):
        print(f"[FileContainer] {message}")

    def debug(self, message):
        print(f"[FileContainer][DEBUG] {message}")

    def get_part(self, index: int) -> BinaryReader:
        if index < 0 or index >= len(self.parts):
            self.log(f"getPart({index}) out of index!")
            return BinaryReader()
        return self.parts[index].unpack()

    def count(self) -> int:
        return len(self.parts)

    def read(self, file_reader: BinaryReader):
        self.parts.clear()

        pos = 0
        HEADER_SIZE = 10

        while pos + HEADER_SIZE < file_reader.length:
            file_reader.set_offset(pos)

            part = UnpackFilePart(file_reader)

            part.offset = pos + HEADER_SIZE
            part.initial_buffer_len = file_reader.read_byte()
            part.checksum = file_reader.read_byte()
            part.unknown1 = file_reader.read_word()
            part.decompressed_size = file_reader.read_word()
            part.unknown0 = file_reader.read_word()
            size = file_reader.read_word()

            part.compressed_size = size - HEADER_SIZE
            part.index = len(self.parts)

            if part.offset < 0 or size > 0xFFFFFF or size < 10:
                self.log(f"out of sync {file_reader.file_name}")
                break

            self.parts.append(part)
            pos += size

        self.debug(f"{file_reader.file_name} has {len(self.parts)} file-parts.")
