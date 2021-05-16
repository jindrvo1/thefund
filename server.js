//import yahooFinance from 'yahoo-finance';
var yahooFinance = require('yahoo-finance');
const express = require('express');
const app = express();
const path = require('path');
const cors = require('cors');
const port = process.env.PORT || 3000;
const fetch = require("node-fetch");

app.use(cors());
app.use(express.static(path.join(__dirname, 'build')));

app.get('/api/yf/quote/:ticker', async (req, res) => {
  return res.send(
      await yahooFinance.quote({
        symbol: req.params.ticker
      }
    )
  )
})

app.get('/api/yf/historical/:ticker/:from', async (req, res) => {
  return res.send(
      await yahooFinance.historical({
        symbol: req.params.ticker,
        from: req.params.from,
        to: new Date().toISOString().substring(0, 10),
      }
    )
  )
})

app.get('/api/exchrates/latest', async (req, res) => {
  return res.send(
      await fetch(`https://api.exchangerate.host/latest?base=EUR`)
        .then(res=>res.json())
  )
})

app.get('/api/exchrates/timeseries/:start_date/:end_date', async (req, res) => {
  let base = "https://api.exchangerate.host";

  return res.send(
      await fetch(`${base}/timeseries?start_date=${req.params.start_date}&end_date=${req.params.end_date}&base=EUR`)
        .then(res=>res.json())
  )
})

app.get('/api/bloomberg/timeseries/:exchange/:stock', async (req, res) => {
  let base = "https://www.bloomberg.com/markets/api";

  return res.send(
      await fetch(
        `${base}/bulk-time-series/price/${req.params.stock}:${req.params.exchange}?timeFrame=1_DAY`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36'
          }
        }
      ).then(res=>res.json())
  )
})

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})
