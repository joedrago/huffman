const fs = require('fs')

class Huffman {
  generateTable(table, node, code = '') {
    if(node.l) {
      this.generateTable(table, node.l, code + "0")
      this.generateTable(table, node.r, code + "1")
    } else {
      if(code == '') {
        // The input stream is all the same value repeated, just emit 0s
        code = '0'
      }
      table[node.value] = code
    }
  }

  writeTree(output, node) {
    let bitCount = 1
    if(node.l) {
      output.push(0)
      bitCount += this.writeTree(output, node.l)
      bitCount += this.writeTree(output, node.r)
    } else {
      output.push(1)
      output.push(node.value)
      bitCount += 8
    }
    return bitCount
  }

  readTree(input) {
    let which = input.shift()
    if(which == 0) {
      // Parent node
      let l = this.readTree(input)
      let r = this.readTree(input)
      return {
        l: l,
        r: r,
      }
    } else {
      // Child node
      let value = input.shift()
      return {
        value: value,

        // for debugging
        char: String.fromCharCode(value),
      }
    }
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

    // Assemble a Huffman tree where the left(0) path is always higher probability than right(1) path
    let occurrences = Object.values(occurrenceMap)
    while(occurrences.length > 1) {
      occurrences.sort( (a, b) => a.count - b.count )

      let node = {
        count: occurrences[0].count + occurrences[1].count,
        l: occurrences[1],
        r: occurrences[0],
      }
      occurrences.shift()
      occurrences.shift()
      occurrences.push(node)
    }

    // The only remaining node is the root of the tree
    let root = occurrences.pop()
    return root
  }

  encode(data) {
    let tree = this.generateTree(data)
    // console.log(JSON.stringify(tree, null, 2))

    let table = {}
    this.generateTable(table, tree)
    // console.log(JSON.stringify(table, null, 2))
    let dataPayload = ""
    for(let byte of data) {
      dataPayload += table[byte]
    }
    let dataBits = dataPayload.length

    let treePayload = []
    let treeBits = this.writeTree(treePayload, tree)

    return {
      tree: treePayload,
      treeBits: treeBits,
      data: dataPayload,
      dataBits: dataBits,
    }
  }

  decode(treePayload, dataPayload) {
    let tree = this.readTree(treePayload)
    // console.log(JSON.stringify(tree, null, 2))

    let output = []
    let bits = dataPayload.split('')
    let n = tree
    for(let bit of bits) {
      if(n.l) {
        if(bit == '0') {
          n = n.l
        } else {
          n = n.r
        }
      }

      if(!n.l) {
        output.push(n.value)
        n = tree
      }
    }

    return Buffer.from(output)
  }
}

main = () => {
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
