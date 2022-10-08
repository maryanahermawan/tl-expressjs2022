const express = require('express');
const axios = require('axios');
const path = require('path');
const convert = require("xml-js");

// Connecting to the database
const sqlite3 = require('sqlite3').verbose();

// call the Database() function of the sqlite3 module
// and pass the database information such as database file, opening mode, and a callback function.
// to open the database
let db = new sqlite3.Database('../db/chinook.db', sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the chinook database.');
});

// ====
// SQL queries:
// Table 'customer_track' has many-to-many relationship between customer and track
const CHECK_CUST_EXISTS = `SELECT * FROM customers WHERE CustomerId=?`;
const CHECK_TRACK_LIKE_EXISTS = `SELECT * FROM customer_track WHERE CustomerId=? AND TrackId=?`;
const ADD_FAVORITE_TRACK = `INSERT INTO customer_track (CustomerId,TrackId) VALUES(?, ?)`;
const GET_FAVORITE_TRACKS_BY_CUST_ID = `SELECT t.Name name, t.UnitPrice unit_price, g.Name genre,
  a.Title album_title, artists.Name artist_name
  FROM customer_track ct INNER JOIN tracks t ON ct.TrackId = t.TrackId
  LEFT JOIN genres g ON t.GenreId = g.GenreId LEFT JOIN albums a ON t.AlbumId = a.AlbumId
  LEFT JOIN artists ON a.ArtistId = artists.ArtistId WHERE ct.CustomerId = ?
  ORDER BY ct.TimeCreated DESC`;
const GET_FAVORITE_PLAYLISTS_BY_CUST_ID = `SELECT p.Name name, p.PlaylistId id 
  FROM customer_playlist cp LEFT JOIN playlists p ON p.PlaylistId = cp.PlaylistId
  WHERE cp.CustomerId = ? ORDER BY cp.TimeCreated DESC`;
const CHECK_TRACK_EXISTS = `SELECT * FROM tracks WHERE TrackId=?`;
const DELETE_TRACK_BY_TRACK_ID = `DELETE FROM tracks where TrackId = ?`;
const GET_TRACK_INFO_BY_TRACK_ID = `SELECT t.Name name, t.UnitPrice unit_price, g.Name genre,
  a.Title album_title, artists.Name artist_name
  FROM tracks t
  LEFT JOIN genres g ON t.GenreId = g.GenreId
  LEFT JOIN albums a ON t.AlbumId = a.AlbumId
  LEFT JOIN artists ON a.ArtistId = artists.ArtistId
  WHERE t.TrackId = ?`;
const GET_ALL_TRACKS = `SELECT t.Name name, t.UnitPrice unit_price, g.Name genre,
  a.Title album_title, artists.Name artist_name
  FROM tracks t
  LEFT JOIN genres g ON t.GenreId = g.GenreId
  LEFT JOIN albums a ON t.AlbumId = a.AlbumId
  LEFT JOIN artists ON a.ArtistId = artists.ArtistId
  LIMIT ? OFFSET ? `;
const UPDATE_TRACK_PRICE = `UPDATE tracks SET UnitPrice = ? WHERE TrackId = ?`;
// ====


const port = 3000;
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Welcome to Oldies Download!');
});


const getFavoritePlaylistsByCustId = (req, res, next) => {

  db.all(GET_FAVORITE_PLAYLISTS_BY_CUST_ID, [req.params.customerId], (err, playlists) => {
    if (err) {
      return next(err);
    }

    res.result = {
      ...res.result,
      playlists
    };

    next();
  });
};

const getFavoriteTracksByCustId = (req, res, next) => {

  db.all(GET_FAVORITE_TRACKS_BY_CUST_ID, [req.params.customerId], (err, tracks) => {
    if (err) {
      return next(err);
    }

    res.result = {
      ...res.result,
      tracks
    };

    next();
  });
};

app.get('/customer/:customerId/get-favorite',
  getFavoritePlaylistsByCustId,
  getFavoriteTracksByCustId,
  (req, res) => {
    res.status(200).json(res.result);
  }
);

app.get('/customer/:customerId/get-favorite-tracks',
  getFavoriteTracksByCustId,
  (req, res) => {
    res.status(200).json(res.result);
  }
);

const checkCustExist = (req, res, next) => {
  db
    // check if there is no customer with this ID, return error status 404 Not Found
    .get(CHECK_CUST_EXISTS, [req.params.customerId], (err, customer) => {
      if (err) {
        return next(err);
      }
      if (!customer) {
        return res.status(404).send('Customer ID is invalid!');
      }
      next();
    });
};

const checkTrackIsLiked = (req, res, next) => {
  db.get(CHECK_TRACK_LIKE_EXISTS, [req.params.customerId, req.params.trackId], (err, like) => {
    if (like) {
      return res.status(204).send();
    }
    next();
  });
};

app.post('/customer/:customerId/add-favorite-track/:trackId', checkCustExist, checkTrackIsLiked,
  (req, res, next) => {
    db
      .run(ADD_FAVORITE_TRACK, [req.params.customerId, req.params.trackId], (err) => {
        if (err) {
          return next(err);
        } else {
          res.status(204).send();
        }
      });
  });

const checkTrackExists = (req, res, next) => {
  db
    // check if there is no track with ID return error status 404 Not Found
    .get(CHECK_TRACK_EXISTS, [req.params.trackId], (err, track) => {
      if (err) {
        return next(err);
      }
      if (!track) {
        return res.status(404).send('Track ID is invalid!');
      }
      next();
    });
};

app.delete('/admin/remove-track/:trackId', checkTrackExists, (req, res, next) => {
  db.run(DELETE_TRACK_BY_TRACK_ID, [req.params.trackId], (err) => {
    if (err) {
      return next(err);
    } else {
      res.status(200).send();
    }
  });
});

app.patch('/admin/update-price/:trackId', checkTrackExists, (req, res, next) => {
  const { new_price } = req.body;
  db.run(UPDATE_TRACK_PRICE, [new_price, req.params.trackId], (err) => {
    if (err) {
      return next(err);
    } else {
      res.status(200).send();
    }
  });
});

app.get('/tracks/get-track-info/:trackId',
  (req, res, next) => {

    db.get(GET_TRACK_INFO_BY_TRACK_ID, [req.params.trackId], (err, trackInfo) => {
      if (err) {
        return next(err);
      }
      if (!trackInfo) {
        return res.status(404).send();
      }
      res.json(trackInfo);
    });
  }
);

const requirePagination = (req, res, next) => {
  if (!req.query.pageNumber || !req.query.pageSize) {
    return res.status(400).json({ message: 'Accepts query parameters pageSize and pageNumber' });
  }
  next();
};

app.get('/tracks/all', requirePagination,
  (req, res, next) => {

    const offset = (req.query.pageNumber - 1) * req.query.pageSize;
    db.all(GET_ALL_TRACKS, [req.query.pageSize, offset], (err, tracks) => {
      if (err) {
        return next(err);
      }

      return res.json(tracks);
    });
  }
);

app.get('/tracks/get-track-lyrics/:trackId',
  (req, res, next) => {
    db.get(GET_TRACK_INFO_BY_TRACK_ID, [req.params.trackId], (err, trackInfo) => {
      if (err) {
        return next(err);
      }
      if (!trackInfo) {
        return res.status(404).send();
      }
      const artist = trackInfo.artist_name;
      const song = trackInfo.name;
      axios.get('http://api.chartlyrics.com/apiv1.asmx/SearchLyricDirect', {
        params: {
          artist,
          song
        },
        responseType: 'xml'
      }).then(resp => {
        const respObject = JSON.parse(
          convert.xml2json(resp.data, { compact: true, spaces: 2 })
        );
        res.status(200).send({ artist, song, lyrics: respObject.GetLyricResult.Lyric._text });
      });
    });
  }
);

app.use('/static', express.static(path.join(__dirname, 'public')));

// Error handler: calling 'next(err)' in other middleware will skip all remaining middleware in the chain except for those that are set up to handle errors as described above.
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});


