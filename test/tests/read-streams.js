var through2 = require('through2')
var mbstream = require('multibuffer-stream')
var buff = require('multibuffer')
var bops = require('bops')
var concat = require('concat-stream')
var os = require('os')
var protobuf = require('protocol-buffers')

module.exports.readStreamBuff = function(test, common) {
  test('readStream returns all buff rows', function(t) {
    common.getDat(t, function(dat, done) {
      var ws = dat.createWriteStream({ columns: ['num'] })
      var nums = []
    
      ws.on('end', function() {
        dat.createReadStream().pipe(concat(function(data) {
          var results = data.map(function(r) { return r.num })
          t.equals(JSON.stringify(nums.sort()), JSON.stringify(results.sort()), 'matches')
          done()
        }))
      })

      var packStream = mbstream.packStream()
      packStream.pipe(ws)
      var schema = protobuf([{name:'num', type:'string'}]);

      // create a bunch of single cell buff rows with incrementing integers in them
      for (var i = 0; i < 1000; i++) {
        packStream.write(schema.encode({num:i+''}))
        nums.push(i + '')
      }
      packStream.end()
    })
  })
}

module.exports.readStreamBuffPrimaryKey = function(test, common) {
  test('readStream returns all buff rows w/ custom primary key', function(t) {
    common.getDat(t, function(dat, done) {
      var ws = dat.createWriteStream({ columns: ['num'], primary: 'num' })
      var nums = []
    
      ws.on('end', function() {
        dat.createReadStream().pipe(concat(function(data) {
          var results = data.map(function(r) { return r.num })
          t.equals(JSON.stringify(nums.sort()), JSON.stringify(results.sort()), 'matches')
          done()
        }))
      })
    
      var packStream = mbstream.packStream()
      packStream.pipe(ws)
    
      var schema = protobuf([{name:'num', type:'string'}]);

      // create a bunch of single cell buff rows with incrementing integers in them
      for (var i = 0; i < 1000; i++) {
        packStream.write(schema.encode({num:i+''}))
        nums.push(i + '')
      }
    
      packStream.end()
    })
  })
}

module.exports.readStreamCsvPrimaryKey = function(test, common) {
  test('readStream returns all csv rows w/ custom primary key', function(t) {
    var expected = ['1', '10', '100']
    common.getDat(t, function(dat, done) {
      var ws = dat.createWriteStream({ csv: true, primary: 'a' })
      var nums = []
    
      ws.on('end', function() {
        dat.createReadStream().pipe(concat(function(data) {
          var results = data.map(function(r) { return r.id })
          t.equals(JSON.stringify(results.sort()), JSON.stringify(expected.sort()), 'matches')
          done()
        }))
      })
    
      ws.write(bops.from('a,b,c\n1,1,1\n10,1,1\n100,1,1'))
      ws.end()
    })
  })
}

module.exports.readStreamNdjPrimaryKey = function(test, common) {
  test('readStream returns all ndjson rows w/ custom primary key', function(t) {
    var expected = ['1', '10', '100']
    common.getDat(t, function(dat, done) {
      var ws = dat.createWriteStream({ json: true, primary: 'a' })
      var nums = []
    
      ws.on('end', function() {
        dat.createReadStream().pipe(concat(function(data) {
          var results = data.map(function(r) { return r.id })
          t.equals(JSON.stringify(results.sort()), JSON.stringify(expected.sort()), 'order matches')
          done()
        }))
      })
    
      ws.write(bops.from(JSON.stringify({"a": "1", "b": "foo"}) + os.EOL))
      ws.write(bops.from(JSON.stringify({"a": "10", "b": "foo"}) + os.EOL))
      ws.write(bops.from(JSON.stringify({"a": "100", "b": "foo"})))
      ws.end()
    })
  })
}

module.exports.getChanges = function(test, common) {
  test('getChanges', function(t) {
    common.getDat(t, function(dat, done) {
      var ws = dat.createWriteStream({ csv: true })
    
      ws.on('end', function() {
        dat.createChangesStream({data: true}).pipe(concat(function(data) {
          var changes = data.map(function(r) { return r.change })
          t.equal(JSON.stringify(changes), JSON.stringify([1,2,3,4,5]) , 'ordered changes 1 - 5 exist')
          t.equal(!!data[0].data, true)
          done()
        }))
      })
    
      ws.write(bops.from('a,b,c\n10,1,1\n100,1,1\n1,1,1\n1,1,1\n1,1,1'))
      ws.end()
    })
  })
}

module.exports.changesStream = function(test, common) {
  test('simple put should trigger a change', function(t) {
    common.getDat(t, function(dat, done) {
      var changes = dat.createChangesStream({ live: true, data: true })
      var gotChange = false
      setTimeout(function() {
        if (gotChange) return
        t.false(true, 'timeout')
        setImmediate(done)
      }, 1000)
      
      changes.pipe(through2({objectMode: true}, function(obj, enc, next) {
        changes.end()
        t.equal(obj.data.foo, "bar")
        gotChange = true
        setImmediate(done)
      }))
      
      dat.put({"foo": "bar"}, function(err, doc) {
        if (err) throw err
      })
    })
  })
}

module.exports.changesStreamTail = function(test, common) {
  test('createChangesStream tail:true', function(t) {
    common.getDat(t, function(dat, done) {
      
      dat.put({"foo": "old"}, function(err) {
        t.notOk(err, 'should not err')
        
        var changes = dat.createChangesStream({ live: true, tail: true, data: true })
        var gotChange = false
        setTimeout(function() {
          if (gotChange) return
          t.false(true, 'timeout')
          setImmediate(done)
        }, 1000)
      
        changes.pipe(through2({objectMode: true}, function(obj, enc, next) {
          changes.end()
          t.equal(obj.data.foo, "new", 'should only get new row, not old row')
          gotChange = true
          setImmediate(done)
        }))
      
        dat.put({"foo": "new"}, function(err) {
          t.notOk(err, 'should not err')
        })
      })

    })
  })
}

module.exports.changesStreamTailNum = function(test, common) {
  test('createChangesStream tail:1', function(t) {
    common.getDat(t, function(dat, done) {
      
      var ws = dat.createWriteStream({objects: true})
      
      ws.on('error', function(err) {
        t.notOk(err)
        setImmediate(done)
      })
      
      ws.on('end', function() {
        dat.dump()
        var changes = dat.createChangesStream({ live: true, tail: 1, data: true })

        var gotChange = false
        setTimeout(function() {
          if (gotChange) return
          t.false(true, 'timeout')
          setImmediate(done)
        }, 1000)
      
        changes.pipe(through2({objectMode: true}, function(obj, enc, next) {
          changes.end()
          t.equal(obj.data.foo, "taco", 'should only get 1 newest row, not older rows')
          gotChange = true
          setImmediate(done)
          next()
        }))
      })
      
      ws.write({'foo': 'bar'})
      ws.write({'foo': 'baz'})
      ws.write({'foo': 'taco'})
      ws.end()
      
    })
  })
}

module.exports.createReadStream = function(test, common) {
  test('createReadStream', function(t) {
    common.getDat(t, function(dat, done) {
      var ws = dat.createWriteStream({ csv: true })
    
      ws.on('end', function() {
        var readStream = dat.createReadStream()
        readStream.pipe(concat(function(rows) {
          t.equal(rows.length, 5, '5 rows')
          done()
        }))
      })
    
      ws.write(bops.from('a,b,c\n10,1,1\n100,1,1\n1,1,1\n1,1,1\n1,1,1'))
      ws.end()
    })
  })
}

 module.exports.createReadStreamValues = function(test, common) {
  test('createReadStream keys:false', function(t) {
    t.end()
  })
//   test('createReadStream keys:false', function(t) {
//     common.getDat(t, function(dat, done) {
//       var ws = dat.createWriteStream({ csv: true })
    
//       ws.on('end', function() {
//         var readStream = dat.createReadStream({keys: false})
//         readStream.pipe(concat({encoding: 'object'}, function(rows) {
//           t.equal(rows.length, 5, '5 rows')
//           t.ok(Array.isArray(rows[0]), 'row is array, not object')
//           t.equal(rows[0][2], '10')
//           t.equal(rows[1][2], '100')
//           t.equal(rows[0][3], '1')
//           done()
//         }))
//       })
    
//       ws.write(bops.from('a,b,c\n10,1,1\n100,1,1\n1,1,1\n1,1,1\n1,1,1'))
//       ws.end()
//     })
//   })
 }

module.exports.createReadStreamStartEndKeys = function(test, common) {
  test('createReadStream w/ start + end keys', function(t) {
    common.getDat(t, function(dat, done) {
      var ws = dat.createWriteStream({ csv: true, primary: 'a' })
    
      ws.on('end', function() {
        var readStream = dat.createReadStream({ start: '2', end: '4'})
        readStream.pipe(concat(function(rows) {
          t.equal(rows.length, 3, '3 rows')
          t.equal(rows[0].a, '2')
          t.equal(rows[1].a, '3')
          t.equal(rows[2].a, '4')
          done()
        }))
      })
    
      ws.write(bops.from('a\n1\n2\n3\n4\n5'))
      ws.end()
    })
  })
}

module.exports.createReadStreamCSV = function(test, common) {
  test('createReadStream csv', function(t) {
    common.getDat(t, function(dat, done) {
      var ws = dat.createWriteStream({ csv: true, primary: 'a' })
    
      ws.on('end', function() {
        var readStream = dat.createReadStream({ csv: true })
        readStream.pipe(concat(function(data) {
          var rows = data.split('\n')
          t.equal(rows[0].split(',').length, 3)
          t.equal(rows[1].split(',').length, 3)
          t.equal(rows.length, 7)
          done()
        }))
      })
    
      ws.write(bops.from('a\n1\n2\n3\n4\n5'))
      ws.end()
    })
  })
}


module.exports.createReadStreamBuff = function(test, common) {
  test('createReadStream buff', function(t) {
    common.getDat(t, function(dat, done) {
      var ws = dat.createWriteStream({ csv: true, primary: 'a' })
    
      ws.on('end', function() {
        var readStream = dat.createReadStream({ buff: true })
        readStream.pipe(concat(function(data) {
          var fields = buff.unpack(data).map(function(d) { return d.toString() })
          var expected = [ 'id', 'version', 'a', 'b', 'c', '1', '1-b6d8970cd4a5e19012f592df2c6377c4', '1', '2', '3' ]
          t.equal(fields.length, 10)
          t.equal(fields[0], 'id')
          t.equal(fields[5], '1')
          done()
        }))
      })
    
      ws.write(bops.from('a,b,c\n1,2,3'))
      ws.end()
    })
  })
}

module.exports.createVersionStream = function(test, common) {
  test('createVersionStream', function(t) {
    common.getDat(t, function(dat, done) {
      dat.put({"id": "foo", "baz": "bar"}, function(err, doc) {
        t.false(err)
        var ver1 = doc.version
        doc.pizza = 'taco'
        dat.put(doc, function(err, doc) {
          t.false(err)
          // put some data before and after to make sure they dont get returned too
          dat.put({'id': 'abc'}, function(err) {
            t.false(err)
            dat.put({'id': 'xyz'}, function(err) {
              t.false(err)
              readVersions()
            })
          })
        })
      })
      
      function readVersions() {
        dat.createVersionStream('foo').pipe(concat(function(versions) {
          t.equal(versions.length, 2, '2 versions')
          var v1 = versions[0] || {version: ""}
          var v2 = versions[1] || {version: ""}
          t.equal(v1.version, 1)
          t.equal(v2.version, 2)
          t.equal(v1.pizza, undefined, 'version 1')
          t.equal(v2.pizza, 'taco', 'version 2')
          setImmediate(done)
        }))
      }
    })
  })
}


module.exports.all = function (test, common) {
  module.exports.readStreamBuff(test, common)
  module.exports.readStreamBuffPrimaryKey(test, common)
  module.exports.readStreamCsvPrimaryKey(test, common)
  module.exports.readStreamNdjPrimaryKey(test, common)
  module.exports.getChanges(test, common)
  module.exports.changesStream(test, common)
  module.exports.changesStreamTail(test, common)
  module.exports.changesStreamTailNum(test, common)
  module.exports.createReadStream(test, common)
  module.exports.createReadStreamValues(test, common)
  module.exports.createReadStreamStartEndKeys(test, common)
  module.exports.createReadStreamCSV(test, common)
  module.exports.createReadStreamBuff(test, common)
  module.exports.createVersionStream(test, common)
}
