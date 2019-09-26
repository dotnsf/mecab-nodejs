//.  app.js
//. https://qiita.com/PonDad/items/81b85d76b1a89ee2598b
var express = require( 'express' ),
    bodyParser = require( 'body-parser' ),
    client = require( 'cheerio-httpcli' ),
    ejs = require( 'ejs' ),
    MeCab = require( 'mecab-async' ),
    multer = require( 'multer' ),
    settings = require( './settings' ),
    app = express();

app.use( express.Router() );
app.use( express.static( __dirname + '/public' ) );

app.set( 'views', __dirname + '/views' );
app.set( 'view engine', 'ejs' );

var mecab = new MeCab();
mecab.command = settings.mecab_command;

app.get( '/detail', function( req, res ){
  var text = req.query.text;

  res.render( 'detail', { text: text } );
});

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
          if( [ '名詞', '動詞', '形容詞' ].indexOf( morph.lexical ) > -1 ){
            var word = morph.original;
            var idx = list.indexOf( word );
            if( idx == -1 ){
              list.push( word );
              results.push( { text: word, weight: 1, link: '/detail?text=' + word } );
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

var port = process.env.PORT || 3000;
app.listen( port );
console.log( "server starting on " + port + " ..." );
