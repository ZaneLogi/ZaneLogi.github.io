def decode_apple2_hires_row(byte_low, byte_high):
    """
    Decode one Apple II hi-res graphics row (2 bytes, 14 bits of pixel data).
    Returns a list of 14 pixel values (0-3).
    """
    bits_low = [(byte_low >> i) & 1 for i in range(7)]
    bits_high = [(byte_high >> i) & 1 for i in range(7)]
    bits = bits_low + bits_high

    high_bit_low = (byte_low >> 7) & 1
    high_bit_high = (byte_high >> 7) & 1

    def color_for_pixel(bit, pos, high_bit):
        if bit == 0:
            return 0
        # Even pixel: violet(2) if high bit clear, blue(2) if set
        # Odd pixel: green(1) if high bit clear, orange(1) if set
        if pos % 2 == 0:
            return 2
        else:
            return 1

    # if bit is not 0, set a color value 1 or 2 based on its column is odd or even
    pixels = [0] * 14
    for i in range(14):
        hb = high_bit_low if i < 7 else high_bit_high
        pixels[i] = color_for_pixel(bits[i], i, hb)

    # Apply white pixel rules for consecutive ones
    for i in range(13):
        if bits[i] == 1 and bits[i+1] == 1:
            pixels[i] = 3
            pixels[i+1] = 3

    # Adjust colored pixels in 101 patterns
    for i in range(12):
        segment3 = bits[i:i+3]
        if segment3 == [1,0,1]:
            hb = high_bit_low if (i+1) < 7 else high_bit_high
            pixels[i+1] = color_for_pixel(1, i, hb)

    return pixels

def decode_apple2_hires_sprite(data):
    """
    Decode a full sprite of 22 bytes (11 rows * 2 bytes each).
    Returns a list of 11 rows, each row is a list of 14 pixel values (0-3).
    """
    if len(data) != 22:
        raise ValueError("Input data must be exactly 22 bytes")

    sprite_pixels = []
    for row in range(11):
        byte_low = data[row*2]
        byte_high = data[row*2 + 1]
        row_pixels = decode_apple2_hires_row(byte_low, byte_high)
        sprite_pixels.append(row_pixels)

    return sprite_pixels


def main():
    from sprite_data_converter import get_sprites_data
    sprites = get_sprites_data()

    pixels = decode_apple2_hires_sprite(sprites[7])
    for row in pixels:
        print(row)  # Each row prints 14 pixel values (0-3)
        
    # color 0 : black
    # color 1 : orange
    # color 2 : blue
    # color 3 : white


if __name__ == "__main__":
    main()
