'use strict';
const fs = require('fs');
const express = require('express');
const app = express();
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const topojson = require('topojson');
const d3 = require('d3');
const d3_composite = require("d3-composite-projections");
const d3_geo = require("d3-geo");
const mongoose = require('mongoose');
const http = require('http').Server(app);
const io = require('socket.io')(http);

let dbURL = "mongodb://db/hourly_precip";

const PORT = 8080;
const HOST = '0.0.0.0';


// create server-side HTML we can add a map to!
function createMap ( template ) {
    
    return new Promise((resolve, reject) => {

        const dom = new JSDOM( template );

        var page = d3.select(dom.window.document),
            svg = page.select("#svg-container")
                      .append("svg")
                        .attr("width", 1250)
                        .attr("height", 1000);
              
        var g = svg.append("g")
                .attr("id", "mapG");
                //.attr("transform", "translate(" + 100 + "," + 30 + ")");


        //console.log( dom.serialize() ) ;
        var projection = d3_composite.geoAlbersUsaTerritories()
                            .scale( 1150 ) 
                            .translate([550, 275]); 

        var path = d3.geoPath()
            .projection(projection);        

        fs.readFile("usa_state_2017_simple.json", "utf8", function(err, topo) {

            if (err) {
            
                return reject( err );
            }    
            else {

                var topoJSON = JSON.parse(topo);
                
                var states = topojson.feature(topoJSON, topoJSON.objects.states_2017).features;

                 // add states from topojson
                 g.selectAll("path")
                      .data(states).enter()
                      .append("path")
                      .attr("class", "feature")
                      .style("fill", "none")
                      .attr("d", path);

                return resolve( dom.serialize() );
            }    
        });
    });
}



process.on('SIGINT', function() {
        process.exit();
});

function streamDat( dateJSON ) {

    console.log(dateJSON.start);
    console.log(dateJSON.end);
    var startDateSplit = dateJSON.start.split("-"),
        endDateSplit = dateJSON.end.split("-");
    var startDate = new Date(+startDateSplit[0], +startDateSplit[1] - 1,  +startDateSplit[2], 0, 0),
        endDate = new Date(+endDateSplit[0], +endDateSplit[1] - 1, +endDateSplit[2], 23, 0);

    mongoose.connect( dbURL );
    var db = mongoose.connection;

    let precipSchema = new mongoose.Schema({
        coop: String
        , station_name: String
        , country_name: String
        , utc_offset: String
        , datetime_utc: Date
        , lat: Number
        , lon: Number
        , precip_amt: Number
       }, { collection : 'posts'} );

    let posts = mongoose.model('posts', precipSchema); 

    var iterDate = startDate;
    
    var interval =  setInterval( sendDat, 2000);
            
    function sendDat(  ) {

       posts.find({datetime_utc : iterDate}, function(err, dat) {

           if (err) {
               return err;
           } else {

               io.emit("streamData", dat);
               iterDate.setTime(iterDate.getTime() + (60*60*1000));
               if (iterDate == endDate) {
                  clearInterval( interval );
               }
           }
       }); 

    }

}



async function runApp() {

    var tempHTML = fs.readFileSync("template.html", "utf8");

    var html = await createMap(tempHTML);

    io.on('connection', function(socket){
        console.log('a user connected');
            socket.on('date submit', function(json){
                console.log('streaming');
                streamDat( json );
            });
    });


    http.listen(PORT, function(){
        console.log(`listening on http:${HOST}:${PORT}`);
    });


    app.get('/', function(req, res) {

        console.log("sending html")
        res.send( html );

    });
}

runApp();
