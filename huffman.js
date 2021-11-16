const fs = require('fs')

class Huffman {
  // ------------------------------------------------------------------------------------
  // Constructor / Init

  constructor() {
    this.clear()
  }

  clear() {
    this.eob = undefined
    this.table = {}
    this.root = {}
    this.treeBits = 0
    this.dataBits = 0

    // Used for bit read/write
    this.bytesRemaining = -1
    this.bitsRemaining = -1
    this.bits = 0
  }

  // ------------------------------------------------------------------------------------
  // Bit helpers

  readBitAvailable(input) {
    if(this.bitsRemaining > 0) {
      return true
    }
    if(this.bytesRemaining == -1) {
      return (input.length > 0)
    }
    return (this.bytesRemaining > 0)
  }

  readBit(input) {
    if(this.bitsRemaining < 1) {
      if(this.bytesRemaining < 0) {
        this.bytesRemaining = input.length
      }
      if(input.bytesRemaining == 0) {
        throw "Ran out of data!"
      }
      this.bits = input[input.length - this.bytesRemaining]
      this.bytesRemaining -= 1
      this.bitsRemaining = 8
    }

    let bit = (this.bits >> 7) & 0x1
    this.bitsRemaining -= 1
    this.bits <<= 1
    return bit
  }

  readUInt(input, bitCount = 8) {
    let v = 0
    for(let i = 0; i < bitCount; ++i) {
      v = (v << 1) | this.readBit(input)
    }
    return v
  }

  writeBit(output, v) {
    if(this.bitsRemaining < 1) {
      if(this.bitsRemaining == 0) {
        output.push(this.bits)
      }
      this.bits = 0
      this.bitsRemaining = 8
    }

    this.bits = (this.bits << 1) | (v & 0x1)
    this.bitsRemaining -= 1
  }

  writeUInt(output, v, bitCount = 8) {
    for(let i = 0; i < bitCount; ++i) {
      let bit = (v >> bitCount - 1 - i) & 0x1
      this.writeBit(output, bit)
    }
  }

  writeCode(output, code) {
    let splitCode = code.split('')
    for(let c of splitCode) {
      this.writeBit(output, (c == '0') ? 0 : 1)
    }
  }

  writeFinish(output) {
    if(this.bitsRemaining > 0) {
      this.bits <<= this.bitsRemaining
      output.push(this.bits)

      this.bits = 0
      this.bitsRemaining = 0
    }
  }

  // ------------------------------------------------------------------------------------
  // Tree / Table Generation (Encoding)

  generateTableRecurse(node, code) {
    if(node.l) {
      this.generateTableRecurse(node.l, code + "0")
      this.generateTableRecurse(node.r, code + "1")
    } else {
      if(code == '') {
        // The input stream is all the same value repeated, just emit 0s
        code = '0'
      }

      node.code = code // for debugging
      if(node.eob) {
        this.eob = code
      } else {
        this.table[node.value] = code
      }
    }
  }

  generateTable() {
    this.table = {}
    this.generateTableRecurse(this.root, '')
  }

  generateTree(data) {
    // Build a list of counts for each byte's occurrence (i.e. the probability of seeing the byte)
    let occurrenceMap = {}
    for(let byte of data) {
      if(!occurrenceMap[byte]) {
        occurrenceMap[byte] = {
          value: byte,
          count: 0,

          // for debugging
          char: String.fromCharCode(byte),
        }
      }
      occurrenceMap[byte].count += 1
    }

    // Pull raw entries, add in End-Of-Block
    let occurrences = Object.values(occurrenceMap)
    occurrences.push({
      value: 0, // unused
      count: 0, // Set to 0 to ensure it always has the lowest probability / largest code
      eob: true,
    })

    // Assemble a Huffman tree where the left(0) path is always higher probability than right(1) path
    while(occurrences.length > 1) {
      occurrences.sort( (a, b) => a.count - b.count )

      let r = occurrences.shift()
      let l = occurrences.shift()
      let node = {
        count: l.count + r.count,
        l: l,
        r: r,
      }
      occurrences.push(node)
    }

    // The only remaining node is the root of the tree
    this.root = occurrences.pop()
  }

  // ------------------------------------------------------------------------------------
  // Tree Serialization

  writeTreeRecurse(output, node) {
    let bitCount = 0
    if(node.l) {
      this.writeBit(output, 0)
      bitCount += 1
      bitCount += this.writeTreeRecurse(output, node.l)
      bitCount += this.writeTreeRecurse(output, node.r)
    } else {
      this.writeBit(output, 1)
      bitCount += 1
      this.writeBit(output, node.eob ? 1 : 0)
      bitCount += 1
      this.writeUInt(output, node.value)
      bitCount += 8
    }
    return bitCount
  }

  writeTree(output) {
    this.treeBits = this.writeTreeRecurse(output, this.root)
  }

  readTreeRecurse(input) {
    let which = this.readBit(input)
    if(which == 0) {
      // Parent node
      let l = this.readTreeRecurse(input)
      let r = this.readTreeRecurse(input)
      return {
        l: l,
        r: r,
      }
    } else {
      // Child node
      let eob = (this.readBit(input) == 1)
      let value = this.readUInt(input)
      let node = {
        value: value,

        // for debugging
        // char: String.fromCharCode(value),
      }
      if(eob) {
        node.eob = true
      }
      return node
    }
  }

  readTree(input) {
    this.root = this.readTreeRecurse(input)
  }

  // ------------------------------------------------------------------------------------
  // Encode

  encode(data) {
    this.clear()

    this.generateTree(data)
    this.generateTable()

    // console.log(JSON.stringify(this.root, null, 2))
    // console.log(JSON.stringify(this.table, null, 2))

    let payload = []
    this.writeTree(payload)
    for(let byte of data) {
      this.writeCode(payload, this.table[byte])
    }
    this.writeCode(payload, this.eob)
    this.writeFinish(payload)

    // for(let b of payload) {
    //   console.log(`Byte: ${b.toString(2)}`)
    // }
    return Buffer.from(payload)
  }

  // ------------------------------------------------------------------------------------
  // Decode

  decode(payload) {
    this.clear()

    this.readTree(payload)
    // console.log(JSON.stringify(this.root, null, 2))

    let output = []
    let n = this.root

    while(this.readBitAvailable(payload)) {
      const bit = this.readBit(payload)
      if(n.l) {
        if(bit == '0') {
          n = n.l
        } else {
          n = n.r
        }
      }

      if(n.eob) {
        // End-of-Block! Bail out
        console.log("Found End-Of-Block, finishing decode...")
        break
      }

      if(!n.l) {
        output.push(n.value)
        n = this.root
      }
    }

    return Buffer.from(output)
  }

  // ------------------------------------------------------------------------------------
}

function main() {
  // Read 'data' from an arbitrary binary file (filename in the first arg)
  let argv = process.argv.slice(2)
  if(argv.length < 1) {
    return
  }
  let data = fs.readFileSync(argv[0])

  // Encode!
  let huffman = new Huffman()
  let payload = huffman.encode(data)

  // Decode it and check to see if it roundtripped successfully
  let decoded = huffman.decode(payload)
  // console.log("\nDecoded:\n---\n" + decoded.toString() + "\n---")
  if (Buffer.compare(data, decoded) == 0) {
    console.log("Buffers match.")
  } else {
    console.log("Buffers DO NOT match!")
  }

  // Print cool stuffs
  let percentage = 100.0 * payload.length / data.length
  console.log(`\nOriginal payload: ${data.length} bytes.`)
  console.log(`New payload: ${payload.length} bytes.`)
  console.log(`Compressed size is ${percentage.toFixed(2)}% of the original size.`)
}

main()
