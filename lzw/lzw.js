"use strict"

class LZW {
    static RESULT = {
        END_OF_CODE: 0,
        END_OF_STREAM: 1,
        UNKNOWN_ERROR: -1,
        FIRST_IS_NOT_CLEAR_CODE: -2,
        CLEAR_CODE_BUT_NOT_12BITS: -3,
        OUTPUT_ERROR: -4
    };

    constructor() {
        this.dic = new Dictionary();
        this.in_buffered_bits = 0;
        this.in_buffer = 0;
        this.out_buffered_bits = 0;
        this.out_buffer = 0;
    }

    encode(is, os, bitcount) {
        let NC; // current code word
        let RM; // keep the previous code word

        // clear buffer data
        this.in_buffered_bits = 0;
        this.in_buffer = 0;

        this.out_buffered_bits = 0;
        this.out_buffer = 0;

        // initialize dictionary
        this.dic.init(bitcount);

        // put CLEAR_CODE
        this.putCode(os, this.dic.CLEAR_CODE, this.dic.BITCOUNT);

        RM = Dictionary.EMPTY;
        NC = this.getChar(is, bitcount);

        while (NC >= 0) {
            let pos = this.dic.getPosition(RM, NC);
            if (pos < 0) { // not hit
                if (this.dic.isFull()) {
                    this.putCode(os, RM, this.dic.BITCOUNT);
                    this.putCode(os, this.dic.CLEAR_CODE, this.dic.BITCOUNT);
                    this.dic.init(bitcount);
                }
                else {
                    this.putCode(os, RM, this.dic.BITCOUNT);
                    this.dic.append(RM, NC);
                }
                RM = NC;
            }
            else {
                RM = pos;
            }
            NC = this.getChar(is, bitcount);
        }
        this.putCode(os, RM, this.dic.BITCOUNT);
        this.putCode(os, this.dic.END_CODE, this.dic.BITCOUNT);

        if (this.out_buffered_bits > 0)
            os.push(this.out_buffer); // flush buffer

        return true;
    }

    putCode(os, code, codesize) {
        this.out_buffer |= (code << this.out_buffered_bits); // add code to high bits
        this.out_buffered_bits += codesize; // buffered bits increases m_bitcount

        // we need to write to output stream?
        while (this.out_buffered_bits >= 8) {
            os.push(this.out_buffer & 0xff);
            this.out_buffer >>= 8;
            this.out_buffered_bits -= 8;
        }
    }

    getChar(is, bitcount) {
        let ch = 0;
        let unfilled_bits = bitcount;

        while (unfilled_bits > 0) {
            if (unfilled_bits >= this.in_buffered_bits) {
                ch = (ch << this.in_buffered_bits) | this.in_buffer;
                unfilled_bits -= this.in_buffered_bits;

                if (is.length == 0) { // no more data
                    if ( unfilled_bits == 0 )
                        this.in_buffered_bits = 0;
                    else
                        return -1;
                }
                else {
                    this.in_buffer = is.shift();
                    this.in_buffered_bits = 8;

                }
            }
            else {
                this.in_buffered_bits -= unfilled_bits;
                ch = (ch << unfilled_bits) | (this.in_buffer >> this.in_buffered_bits);
                this.in_buffer &= ((1 << this.in_buffered_bits ) - 1);
                unfilled_bits = 0;
            }
        }
        return ch;
    }

    decode(is, os, bitcount) {
        let NC; // current code word
        let RM; // keep the previous code word

        // clear buffer data
        this.in_buffered_bits = 0;
        this.in_buffer = 0;

        this.out_buffered_bits = 0;
        this.out_buffer = 0;

        // initialize dictionary
        this.dic.init(bitcount);

        // get CLEAR_CODE
        NC = this.getCode(is, this.dic.BITCOUNT);
        if (NC != this.dic.CLEAR_CODE)
            return LZW.RESULT.FIRST_IS_NOT_CLEAR_CODE;

        // get the first real data
        NC = this.getCode(is, this.dic.BITCOUNT);
        if (NC == -1)
            return LZW.RESULT.END_OF_STREAM;

        this.putChar(os, NC, bitcount);

        RM = NC;

        NC = this.getCode(is, this.dic.BITCOUNT);
        if (NC == -1)
            return LZW.RESULT.END_OF_STREAM;

        let ret = LZW.RESULT.END_OF_CODE;

        while (NC != this.dic.END_CODE) {
            if (NC == this.dic.CLEAR_CODE) {
                if (this.dic.BITCOUNT != 12) {
                    ret = LZW.RESULT.CLEAR_CODE_BUT_NOT_12BITS;
                    break;
                }

                this.dic.init(bitcount);

                // get the first useful data
                NC = this.getCode(is, this.dic.BITCOUNT);
                if (NC == -1) {
                    ret = LZW.RESULT.END_OF_STREAM;
                    break;
                }

                this.putChar(os, NC, bitcount);
            }
            else {
                this.dic.insert(RM,NC);
                if (!this.putChar(os, NC, bitcount))
                    return LZW.RESULT.OUTPUT_ERROR;
            }

            // shift roles - the current NC becomes the RM
            RM = NC;

            NC = this.getCode(is, this.dic.BITCOUNT);
            if (NC == -1) {
                ret = LZW.RESULT.END_OF_STREAM;
                break;
            }
        }

        if (this.out_buffered_bits > 0) { // flush buffer
            os.push(this.out_buffer);
        }

        return ret;
    }

    getCode(is, codesize) {
        let code = 0;
        let requested_bits = codesize;

        while (requested_bits > 0) {
            // read more 1 byte = 8 bits
            if (requested_bits > this.in_buffered_bits) {
                if (is.length == 0)
                    return -1;
                let data = is.shift();
                this.in_buffer |= (data << this.in_buffered_bits);
                this.in_buffered_bits += 8;
            }
            // retrieve code from bufferedData
            else {
                code = this.in_buffer & ((1 << requested_bits) - 1);
                this.in_buffer >>= requested_bits;
                this.in_buffered_bits -= requested_bits;
                requested_bits = 0;
            }
        }
        return code;
    }

    putChar(os, code, bitcount) {
        // output the data whose bit counts is same as 'bitcount'.
        // ie. 5bits=>0x1f, 8bits=>0xff.
        // if there is a request to pack the bits, do it in the ostream derived class
        for (const ch of this.dic.getString(code)) {
            os.push(ch);
        }
        return true;
    }
};

class Dictionary {
    static MAX_DIC_SIZE = 4096;
    static EMPTY = -1;

    constructor() {
        this.CLEAR_CODE = 0;
        this.END_CODE = 0;
        this.BITCOUNT = 0;

        this.dic = new Array(Dictionary.MAX_DIC_SIZE);
        this.dic_size = 0;
        this.dic_last_position = 0;
    }

    init(bitcount) {
        if (bitcount == 1) {
            bitcount = 2;
        }

        this.BITCOUNT = bitcount;
        this.dic_size = 1 << this.BITCOUNT;

        for (let i = 0; i <= this.dic_size + 1; i++) {
            this.dic[i] = {
                prefix: Dictionary.EMPTY,
                character: i
            };
        }

        this.CLEAR_CODE = this.dic_size; // 256 for 8 bits
        this.END_CODE = this.dic_size + 1; // 257 for 8 bits

        this.dic_last_position = this.dic_size + 1;
        this.BITCOUNT++;
        this.dic_size = 1 << this.BITCOUNT;

        this.output_string = new Array(Dictionary.MAX_DIC_SIZE);
    }

    getPosition(RM, NC) {
        for (let i = 0; i <= this.dic_last_position; i++) {
            if ((RM == this.dic[i].prefix) && (NC == this.dic[i].character))
                return i;
        }
        return Dictionary.EMPTY;
    }

    isFull() {
        return (this.dic_last_position == Dictionary.MAX_DIC_SIZE - 1);
    }

    append(RM, NC) {
        this.dic_last_position++;
        this.dic[this.dic_last_position] = {
            prefix: RM,
            character: NC
        };

        if (this.dic_last_position == this.dic_size && this.dic_last_position + 1 != Dictionary.MAX_DIC_SIZE) {
            // when we meet the max size, don't need to expand it
            this.BITCOUNT++;
            this.dic_size <<= 1;
        }
    }

    insert(RM, NC) {
        let code;

        if (NC <= this.dic_last_position) { // codeword is already in the dictionary
            code = NC;
        }
        else { // codeword is not yet defined
            code = RM;
        }

        while (this.dic[code].prefix != Dictionary.EMPTY) {
            code = this.dic[code].prefix;
        }

        this.dic_last_position++;
        this.dic[this.dic_last_position] = {
            prefix: RM,
            character: this.dic[code].character
        };

        if (this.dic_last_position == this.dic_size - 1 && this.dic_last_position != Dictionary.MAX_DIC_SIZE - 1) {
            // when we meet the max size, don't need to expand it
            this.BITCOUNT++;
            this.dic_size <<= 1;
        }
    }

    getString(code) {
        let p = [];

        if (code > this.dic_last_position)
            return p;

        do {
            let NS = this.dic[code];
            p.unshift(NS.character);
            code = NS.prefix;
        } while (code != Dictionary.EMPTY);

        return p;
    }
};
