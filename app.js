//.  app.js
//. https://qiita.com/PonDad/items/81b85d76b1a89ee2598b
var express = require( 'express' ),
    bodyParser = require( 'body-parser' ),
    client = require( 'cheerio-httpcli' ),
    cloudantlib = require( '@cloudant/cloudant' ),
    fs = require( 'fs' ),
    MeCab = require( 'mecab-async' ),
    multer = require( 'multer' ),
    pdf = require( 'pdf-parse' ),
    settings = require( './settings' ),
    app = express();

app.use( express.Router() );
app.use( express.static( __dirname + '/public' ) );

var upload = multer( { dest: '../tmp/' } );
app.use( bodyParser.urlencoded( { limit: '10mb', extended: true } ) );
app.use( bodyParser.json() );

var mecab = new MeCab();
mecab.command = settings.mecab_command;

var db = null;
var cloudant = null;
if( settings.db_username && settings.db_password && settings.db_name ){
  cloudant = cloudantlib( { account: settings.db_username, password: settings.db_password } );
  if( cloudant ){
    cloudant.db.get( settings.db_name, function( err, body ){
      if( err ){
        if( err.statusCode == 404 ){
          cloudant.db.create( settings.db_name, function( err, body ){
            if( err ){
              db = null;
            }else{
              db = cloudant.db.use( settings.db_name );
            }
          });
        }else{
          db = cloudant.db.use( settings.db_name );
        }
      }else{
        db = cloudant.db.use( settings.db_name );
      }
    });
  }
}

app.get( '/get', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  var text = req.query.text;
  var url = req.query.url;
  if( text ){
    text2morphs( text ).then( function( results ){
      res.write( JSON.stringify( { status: true, results: results } ) );
      res.end();
    }, function( err ){
      res.status( 400 );
      res.write( JSON.stringify( { status: false, error: err } ) );
      res.end();
    });
  }else if( url ){
    client.fetch( url, {} ).then( ( result ) => {
      text = result.$('body').text();
      text2morphs( text ).then( function( results ){
        res.write( JSON.stringify( { status: true, results: results } ) );
        res.end();
      }, function( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, error: err } ) );
        res.end();
      });
    }, ( err ) => {
      res.status( 400 );
      res.write( JSON.stringify( { status: false, error: err } ) );
      res.end();
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, error: 'no text found.' } ) );
    res.end();
  }
});

app.get( '/byname', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  var name = req.query.name;
  if( db ){
    var q = {
      selector: {
        name: { "$eq": name }
      }
    };
    db.find( q ).then( function( body ){
      var docs = [];
      var words = [];
      body.docs.forEach( function( doc ){
        //. doc = { _id: '_id', filename: 'filename', name: 'name', yyyy: yyyy, nn: nn, datetime: datetime, results: [ { text: 'text', weight: m }, .. ] }
        //console.log( doc );
        docs.push( doc );

        doc.results.forEach( function( result ){
          var b = false;
          words.forEach( function( word ){
            if( word.text == result.text ){
              b = true;
              word.weight += result.weight;
            }
          });
          if( !b ){
            words.push( result );
          }
        });
      });

      words.sort( compare );
      res.write( JSON.stringify( { status: true, docs: docs, words: words } ) );
      res.end();
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, error: 'db not initialized.' } ) );
    res.end();
  }
});

app.get( '/bynameword', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  var name = req.query.name;
  var word = req.query.word;
  if( db ){
    var q = {
      selector: {
        name: { "$eq": name }
      }
    };
    db.find( q ).then( function( body ){
      var weights = [];
      body.docs.forEach( function( doc ){
        //. doc = { _id: '_id', filename: 'filename', name: 'name', yyyy: yyyy, nn: nn, datetime: datetime, results: [ { text: 'text', weight: m }, .. ] }
        //console.log( doc );
        var weight = 0;
        doc.results.forEach( function( result ){
          if( result.text == word ){
            weight = result.weight;
          }
        });

        var data = { name: name, yyyy: doc.yyyy, nn: doc.nn, weight: weight };
        weights.push( data );
      });

      weights.sort( compare2 );
      res.write( JSON.stringify( { status: true, weights: weights } ) );
      res.end();
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, error: 'db not initialized.' } ) );
    res.end();
  }
});

app.post( '/upload', upload.single( 'file' ), function( req, res ){
  console.log( 'POST /upload' );
  res.contentType( 'application/json; charset=utf-8' );

  if( req.file && req.file.path ){
    var path = req.file.path;
    var filetype = req.file.mimetype;
    var filename = req.file.originalname;

    if( filetype.indexOf( 'msword' ) >= 0 ){
    }else if( filetype.indexOf( 'pdf' ) >= 0 ){
      var buf = fs.readFileSync( path );
      pdf( buf ).then( function( data ){
        /*
        console.log( data.text );
        res.write( JSON.stringify( { status: true, text: data.text } ) );
        res.end();
        */
        var text = data.text.split( "\n" ).join( '' );

        text2morphs( text ).then( function( results ){
          res.write( JSON.stringify( { status: true, results: results } ) );
          res.end();
        }, function( err ){
          res.status( 400 );
          res.write( JSON.stringify( { status: false, error: err } ) );
          res.end();
        });
      }).catch( function( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, error: err } ) );
        res.end();
      });
    }else{
      res.status( 400 );
      res.write( JSON.stringify( { status: false, error: 'unknown file type.' } ) );
      res.end();
    }
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, error: 'no file found.' } ) );
    res.end();
  }
});

function text2morphs( text ){
  return new Promise( function( resolve, reject ){
    mecab.parseFormat( text, function( err, morphs ){
      if( err ){
        reject( err );
      }else{
        var results = [];
        var list = [];
        morphs.forEach( function( morph ){
          //. morph = { kanji: "おはよう", lexical: "感動詞", compound: "*", compound2: "*", compound3: "*", conjugation: "*", inflection: "*", original: "おはよう", "reading": "オハヨウ", pronounciation: "オハヨー" }
          if( [ '名詞', '代名詞', '動詞', '形容詞' ].indexOf( morph.lexical ) > -1 ){
            var word = morph.original;
            var idx = list.indexOf( word );
            if( idx == -1 ){
              var result = {
                text: word,
                weight: 1
              };
              list.push( word );
              results.push( result );
            }else{
              results[idx].weight ++;
            }
          }
        });

        //resolve( morphs );
        results.sort( compare );
        resolve( results );
      }
    });
  });
}

function compare( a, b ){
  if( a.weight < b.weight ){
    return 1;
  }else if( a.weight > b.weight ){
    return -1;
  }else{
    return 0;
  }
}

function compare2( a, b ){
  if( a.yyyy + '_' + a.nn < b.yyyy + '_' + b.nn ){
    return -1;
  }else if( a.yyyy + '_' + a.nn > b.yyyy + '_' + b.nn ){
    return 1;
  }else{
    return 0;
  }
}

var port = process.env.PORT || 3000;
app.listen( port );
console.log( "server starting on " + port + " ..." );
