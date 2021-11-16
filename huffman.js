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
      output.push(0)
      bitCount += 1
      bitCount += this.writeTreeRecurse(output, node.l)
      bitCount += this.writeTreeRecurse(output, node.r)
    } else {
      output.push(1)
      bitCount += 1
      output.push(node.eob ? 1 : 0)
      bitCount += 1
      output.push(node.value)
      bitCount += 8
    }
    return bitCount
  }

  writeTree() {
    let output = []
    this.treeBits = this.writeTreeRecurse(output, this.root)
    return output
  }

  readTreeRecurse(input) {
    let which = input.shift()
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
      let eob = (input.shift() == 1)
      let value = input.shift()
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

    let dataPayload = ""
    for(let byte of data) {
      dataPayload += this.table[byte]
    }
    dataPayload += this.eob
    this.dataBits = dataPayload.length

    let treePayload = this.writeTree()

    return {
      tree: treePayload,
      data: dataPayload,

      treeBits: this.treeBits,
      dataBits: this.dataBits,
    }
  }

  // ------------------------------------------------------------------------------------
  // Decode

  decode(treePayload, dataPayload) {
    this.clear()

    this.readTree(treePayload)
    // console.log(JSON.stringify(this.root, null, 2))

    let output = []
    let bits = dataPayload.split('')
    let n = this.root
    for(let bit of bits) {
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
  let encoded = huffman.encode(data)
  // console.log(encoded)

  // Decode it and check to see if it roundtripped successfully
  let decoded = huffman.decode(encoded.tree, encoded.data)
  // console.log("\nDecoded:\n---\n" + decoded.toString() + "\n---")
  if (Buffer.compare(data, decoded) == 0) {
    console.log("Buffers match.")
  } else {
    console.log("Buffers DO NOT match!")
  }

  // Print cool stuffs
  let totalBits = encoded.treeBits + encoded.dataBits
  let totalBytes = Math.floor((totalBits + 7) / 8)
  let percentage = 100.0 * totalBytes / data.length
  console.log(`\nOriginal payload: ${data.length} bytes.`)
  console.log(`tree(${encoded.treeBits}) bits + data(${encoded.dataBits}) bits = ${totalBits} bits = ${totalBytes} bytes.`)
  console.log(`Compressed size is ${percentage.toFixed(2)}% of the original size.`)
}

main()
