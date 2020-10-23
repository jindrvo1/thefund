import React, { Component } from 'react';
import Papa from 'papaparse';
import yahooFinance from 'yahoo-finance';
import Plot from 'react-plotly.js';
import { Tabs, Tab } from '@material-ui/core'
import { withStyles } from '@material-ui/core/styles';
import style from './style.module.css';

export default class Home extends Component {
		constructor(props){
			super(props);
			this.state = {
				files: {
					transactions: 'transactions.csv',
					deposits: 'deposits.csv',
					vault: 'vault.csv'
				},
				bloombergId: {
					'L': 'LN'
				},
				loading: true,
				currentPlotTab: 0
			}
		}

		/**
		 * Parses a csv file by its path and returns a promise with the data.
		 * @param file {string} - Path to the CSV file.
		 * @returns {Promise<[Object]>} - A promise which is resolved when the file is retrieved.
		 * @private
		 */
		 _loadCSV = file => {
 			return new Promise(resolve => {
 				Papa.parse(file, {
 					header: true,
 					delimeter: ',',
 					download: true,
 					complete: res => {
 						resolve(res.data);
 					}
 				});
 			});
 		}

		/**
		 * Cleans transaction dataset from empty tickers (end of line of the file) and sold tickers.
		 * @param data {[Object]} - The dataset of transactions.
		 * @returns {[Object]} - Cleaned dataset of transactions.
		 * @private
		 */
		_cleanTransactions = data => {
			data = this._removeEmpty(data);
			data = this._removeSoldTickers(data);

			return data;
		}

		/**
		 * Filters out rows with empty data (end line).
		 * @param data {[Object]} - The dataset of transactions.
		 * @returns {[Object]} - Filtered dataset.
		 * @private
		 */
		_removeEmpty = data => {
			return data.filter(t => t.Date !== "");
		}

		/**
		 * Check if the list of transactions to determine whether a ticker is already sold.
		 * A ticker is sold iff amounts of all its transactions add up to 0.
		 * @param row {Object} - The transaction row to check for.
		 * @param data {[Object]} - The transactions.
		 * @returns {boolean} - True if ticker is sold, false otherwise.
		 * @private
		 */
		_checkIfTickerSold = (row, data) => {
			return data
				.filter(t => t.Ticker === row.Ticker)
				.map(t => parseInt(t.Amount))
				.reduce((a, b) => a + b, 0) === 0;
		}

		/**
		 * Filters out sold tickers from the transactions dataset.
		 * @param data {[Object]} - The dataset of transactions.
		 * @returns {[Object]} - Filtered dataset.
		 * @private
		 */
		_removeSoldTickers = data => {
			return data
				.filter(t => !this._checkIfTickerSold(t, data));
		}

		/**
		 * Calculated the weighted sum of two arrays of equal lengths.
		 * @param x {[float]} - The values to sum up.
		 * @param y {[float]} - The weights to use.
		 * @returns {float} - The weighted sum.
		 * @private
		 */
		_weightedSum = (x, y) => {
			let sum = 0;

			x.forEach((_, i) => {
					sum += x[i] * y[i];
			})

			sum /= y.reduce((a, b) => a + b, 0);

			return sum;
		}

		/**
		 * Groups the transactions by their ticker and performs necessary operations
		 * for the information to still be usable (e.g. weighted sum on price).
		 * @param data {[Object]} - The dataset of transactions.
		 * @returns {[Object]} - Dataset of transactions with duplicate tickers groupped.
		 * @private
		 */
		_groupByTicker = data => {
			let unique = data
				.map(t => t.Ticker)
				.filter((t, i, arr) => arr.indexOf(t) === i);

			let groupped = [];
			unique.forEach(un => {
				let rel = data.filter(t => t.Ticker === un);
				groupped.push({
					Ticker: rel[0].Ticker,
					Amount: rel
						.map(t => parseInt(t.Amount))
						.reduce((a, b) => a + b, 0),
					Currency: rel[0].Currency,
					ExchangeRate: this._weightedSum(
						rel.map(t => parseFloat(t.ExchangeRate)),
						rel.map(t => parseInt(t.Amount))
					),
					Fees: rel
						.map(t => parseFloat(t.Fees))
						.reduce((a, b) => a + b, 0),
					PricePerShare: this._weightedSum(
						rel.map(t => parseFloat(t.PricePerShare)),
						rel.map(t => parseInt(t.Amount))
					),
					TotalPriceEUR: rel
						.map(t => parseFloat(t.TotalPriceEUR))
						.reduce((a, b) => a + b, 0)
				});
			});

			return groupped;
		}

		/**
		 * Converts one row of the transaction dataset to GBP.
		 * @param row {Object} - The row from the transaction dataset to convert.
		 * @returns {Object} - Updated `row`.
		 * @private
		 */
		_convertRowToGBP = row => {
			row.Currency = 'GBP';
			row.ExchangeRate /= 100;
			row.PricePerShare /= 100;
			row.ConvertedGBXToGBP = true;
			// row.LivePrice /= 100;

			return row;
		}

		/**
		 * Converts all rows in data set that use GBX as currency to GBP.
		 * @param data {[Object]} - The dataset of transactions.
		 * @returns {[Object]} - Updated dataset of transactions.
		 * @private
		 */
		_convertGBXToGBP = data => {
			return data
				.map(t => t.Currency === "GBX" ? this._convertRowToGBP(t) : t);
		}

		/**
		 * Retrieves an individual stock via the yahoo-finance API.
		 * @param ticker {string} - The ticker of the stock.
		 * @returns {Promise<int>} - A promise which is resolved when the stock price is retrieved.
		 * @private
		 */
		_getStock = ticker => {
			return new Promise(resolve  => {
				yahooFinance.quote({
					symbol: ticker
				}, (err, quote) => {
					resolve(quote.price.regularMarketPrice);
				})
			})
		}

		/**
		 * Retrieves and assigns live prices of all stocks in provided array.
		 * @param data {[Object]} - The dataset of transactions.
		 * @returns {Promise<[Object]>} - A promise which is resolved when all stocks are retrieved and assigned.
		 * @private
		 */
		_assignLivePrices = data => {
			let promises = data.map((item, i) => {
				return this._getStock(item.Ticker).then(price => {
					data[i].LivePrice = price;
					return data[i];
				})
			})

			return Promise.all(promises);
		}

		/**
		 * Retrieves exchange rates between all available currencies and EUR
		 * @returns {Object} - Object holding exchange rates of all available currencies and EUR.
		 * @private
		 */
		_getExchangeRates = () => {
			return new Promise(resolve => {
				fetch(`https://api.exchangeratesapi.io/latest?base=EUR`)
					.then(res => res.json())
					.then(exch => {
						resolve(exch.rates);
					})
			})
		}

		_getExchangeRatesFromTo = (dateFrom, dateTo) => {
			dateFrom = dateFrom.toISOString().substring(0, 10);
			dateTo = dateTo.toISOString().substring(0, 10);

			return new Promise(resolve => {
				fetch(`https://api.exchangeratesapi.io/history?start_at=${dateFrom}&end_at=${dateTo}`)
					.then(res => res.json())
					.then(exch => {
						resolve(exch.rates);
					})
			})
		}

		_convertDates = data => {
			return data
				.map(d => ({...d, Date: new Date(
					parseInt(d.Date.split('-')[2]),
					parseInt(d.Date.split('-')[1])-1,
					parseInt(d.Date.split('-')[0]),
				)}))
		}

		_convertNumber = (data, field) => {
			return data
				.map(d => {
					let obj = {};
					obj[field] = Number(d[field]);
					return ({...d, ...obj})
				})
		}

		_preprocessTransactions = transactions => {
			let res = this._removeEmpty(transactions);
			res = this._convertNumber(res, 'Amount');
			res = this._convertNumber(res, 'ExchangeRate');
			res = this._convertNumber(res, 'Fees');
			res = this._convertNumber(res, 'PricePerShare');
			res = this._convertNumber(res, 'TotalPriceEUR');
			res = this._convertDates(res);

			return res;
		}

		/**
		 * Converts deposits into floats.
		 * @param deposits {[Object]} - The dataset of the deposits.
		 * @returns {[Object]} - Modified dataset of the deposits.
		 * @private
		 */
		_preprocessDeposits = deposits => {
			let res = this._removeEmpty(deposits);
			res = this._convertNumber(res, 'Amount');
			res = this._convertDates(res);

			return res
		}

		_preprocessVault = vault => {
			let res = this._removeEmpty(vault);
			res = this._convertNumber(res, 'Amount');
			res = this._convertDates(res);

			return res;
		}

		_getStockAtDate = (ticker, date) => {
			return new Promise(resolve  => {
				yahooFinance.historical({
					symbol: ticker,
					from: date,
					to: new Date()
				}, (err, quotes) => {
					resolve(quotes);
				})
			})
		}

		_getStocksAtDate = (data, date) => {
			let promises = data.map((item, i) => {
				return this._getStockAtDate(item, date).then(pr => {
					return {ticker: item, price: pr};
				})
			})

			return Promise.all(promises);
		}

		_calcWorthAtDates = async (date, transactions, vault) => {
			let prices = await this._getStocksAtDate(
				this._convertGBXToGBP(transactions)
					.map(t => t.Ticker)
					.filter((t, i, arr) => arr.indexOf(t) === i),
				date
			);

			prices = prices
				.map(t => ({...t, price: t.price
					.map(p => ({...p, date: new Date(p.date.setHours(0,0,0))}))
				})
			);

			let currAmount = {};
			transactions.forEach((t, i) => {
				if (!(t.Ticker in currAmount)) {
					currAmount[t.Ticker] = 0
				}
				currAmount[t.Ticker] += t.Amount;
				transactions[i].currAmount = currAmount[t.Ticker];
			});

			let res = [];
			let exchRates = await this._getExchangeRatesFromTo(date, new Date());
			let currDate = date;
			let today = new Date();

			while (currDate <= today) {
				let vaultWorth = vault
					.filter(v => v.Date <= currDate)
					.sort((a, b) => b.Date - a.Date)[0].Amount;

				let currDateStr = currDate.toISOString().substring(0, 10);
				prices.forEach((item, i) => {
					let rel = transactions
						.filter(t => t.Ticker === item.ticker)
						.filter(t => t.Date <= currDate)
						.sort((a, b) => b.Date - a.Date);

					if (rel.length > 0) {
						let fees = rel.map(p => p.Fees).reduce((a, b) => a + b);
						rel = rel[0];
						let relExchRate = exchRates[currDateStr];
						let closestDate = currDate;
						while (relExchRate === undefined) {
							closestDate = new Date(closestDate.getTime() - 24 * 60 * 60 * 1000);
							relExchRate = exchRates[closestDate.toISOString().substring(0, 10)];
						}
						relExchRate = relExchRate[rel.Currency];
						let relPrice = item.price.filter(d => {
							return d.date.getFullYear() === currDate.getFullYear() &&
										d.date.getMonth() === currDate.getMonth() &&
										d.date.getDate() === currDate.getDate()
						});

						closestDate = currDate;
						while (relPrice.length === 0) {
							closestDate = new Date(closestDate.getTime() - 24 * 60 * 60 * 1000);
							relPrice = item.price.filter(d => {
								return d.date.getFullYear() === closestDate.getFullYear() &&
											d.date.getMonth() === closestDate.getMonth() &&
											d.date.getDate() === closestDate.getDate()
							});
						}
						relPrice = (relPrice && relPrice.length > 0) ? relPrice[0].close : 0;
						relPrice = rel.ConvertedGBXToGBP ? relPrice / 100 : relPrice;

						let stocksWorth = relPrice * (1/relExchRate) * rel.currAmount + fees;

						res.push({
							Date: currDate,
							Ticker: item.ticker,
							Stocks: stocksWorth,
							Vault: vaultWorth
						});
					}
				});

				currDate = new Date(currDate.getTime() + 24 * 60 * 60 * 1000);
			}

			return res;
		}

		_calcWorth = (data, deposits) => {
			let uniqueDates = data
				.map(d => d.Date)
				.filter((date, i, arr) => arr.findIndex(d => d.getTime() === date.getTime()) === i);

			let res = uniqueDates.map(date => {
				let vault = data
					.filter(d => d.Date.valueOf() === date.valueOf())[0].Vault;
				let stocksWorth = data
					.filter(d => d.Date.valueOf() === date.valueOf())
					.map(d => d.Stocks)
					.reduce((a, b) => a + b, 0);
				let deposited = deposits
					.filter(d => d.Date.valueOf() === date.valueOf())[0].Deposited;

				return {
					Date: date,
					Worth: stocksWorth + vault,
					WorthStocks: stocksWorth,
					WorthVault: vault,
					RelProfit: ((stocksWorth + vault)/deposited-1)*100
				}
			});

			return res;
		}

		_fillDeposits = (date, data) => {
			let res = [];

			let currDate = date;
			let today = new Date();
			while (currDate < today) {
				let rel = data.filter(d => d.Date <= currDate);
				res.push({
					Date: currDate,
					Deposited: rel.map(d => d.Amount).reduce((a, b) => a + b, 0)
				});
				currDate = new Date(currDate.getTime() + 24 * 60 * 60 * 1000);
			}

			return res;
		}

		_translateBloombergId = id => {
			return this.state.bloombergId[id];
		}

		_getStockBloomberg = ticker => {
			let parts = ticker.split(".");
			let stock = parts[0];
			let stockExchange = parts.length > 1 ? this._translateBloombergId(parts[1]) : "US";

			return fetch(
				`https://www.bloomberg.com/markets/api/bulk-time-series/price/${stock}%3A${stockExchange}?timeFrame=1_DAY`
			)
			.then(response => response.json())
			.then(data => data[0]);
		}

		_getStocksBloomberg = data => {
			let promises = data.map((item, i) => {
				return this._getStockBloomberg(item).then(pr => {
					return {ticker: item, price: pr.price, close: pr.lastPrice};
				})
			})

			return Promise.all(promises);
		}

		_calcProfit = transactions => {
			let boughtFor = this._weightedSum(
												transactions.filter(t => t.Amount > 0).map(t => 1/t.ExchangeRate*t.PricePerShare*t.Amount),
												transactions.filter(t => t.Amount > 0).map(t => t.Amount)
											)

			console.log(boughtFor);
		}

		_getDateRange = (start, end, step) => {
				let res = [];
				let curr = start;

				while (curr < end) {
					res.push(curr);
					curr = new Date(curr.getTime() + step);
				}

				return res;
		}

		_calcDailyProgress = async (transactions, vault) => {
				// Calculate vault worth by taking the latest amount from the vault dataset
			// Simply takes the latest amount from the dataset
			let vaultWorth = vault.sort((a, b) => b.Date - a.Date)[0].Amount;

			// Calculate overall fees by taking a sum of all fees in the transactions dataset
			let feesWorth = transactions
				.map(t => t.Fees)
				.reduce((a, b) => a + b, 0);

			// Get tickers of all currently owned stocks
			let unfinishedTickers = transactions
				.filter(t => !this._checkIfTickerSold(t, transactions))
				.map(t => t.Ticker)
				.filter((t, i, arr) => arr.indexOf(t) === i);

			// Get 1-day frame of prices with 5 minute intervals of currently owned stocks
			// Note that if trading hasn't started for current day, previous day is fetched instead
			let unfinishedPrices = await this._getStocksBloomberg(unfinishedTickers);

			// Convert date times to server's time zone
			unfinishedPrices = unfinishedPrices
				.map(p => ({...p, price: p.price
					.map(p => ({ dateTime: new Date(p.dateTime), value: p.value }))
				}));

 			// Create a range of dates starting today 00:00 and ending 23:59 with 5 minute intervals
			let dateRange = this._getDateRange(
				new Date(new Date().setHours(0, 0, 0, 0)),
				new Date(new Date().setHours(23, 59, 0, 0)),
				5*60*1000
			);

			let now = new Date();

			// Fetch today's exchange rates
			let exchangeRates = await this._getExchangeRates();
			let base = vaultWorth + feesWorth;

			let res = [];
			dateRange.forEach((date, i) => {
				// Get latest price if any price is available today, otherwise get yesterday's close
				let currPrice = unfinishedPrices
					.map(un => {
						let match = un.price.filter(p => p.dateTime.getTime() === date.getTime())
						let curr = transactions
							.filter(t => t.Ticker === un.ticker)
							.map(t => t.Currency)[0];
						let amount = transactions
							.filter(t => t.Ticker === un.ticker)
							.map(t => t.Amount)
							.reduce((a, b) => a + b, 0);
						let price = match.length > 0 ? match[0].value : un.close;

						price *= amount/(exchangeRates[curr]);
						price /= curr === 'GBP' ? 100 : 1;

						return {
							Ticker: un.ticker,
							Price: price
						}
					});

					res.push({
						Date: date,
						Worth: date > now ? undefined : (base + currPrice
							.map(p => p.Price)
							.reduce((a, b) => a + b, 0)),
						Stocks: date > now ? undefined : currPrice,
						Vault: vaultWorth
					})
			});

			return res;
		}

		async componentDidMount() {
			let transactions = await this._loadCSV(this.state.files.transactions);
			let deposits = await this._loadCSV(this.state.files.deposits);
			let vault = await this._loadCSV(this.state.files.vault);

			transactions = this._preprocessTransactions(transactions);
			deposits = this._preprocessDeposits(deposits);
			vault = this._preprocessVault(vault);

			let uniqueDates = transactions
				.map(t => t.Date)
				.concat(deposits.map(d => d.Date))
				.concat(vault.map(v => v.Date))
				.filter((date, i, arr) => arr.findIndex(d => d.getTime() === date.getTime()) === i)
				.sort((a, b) => a - b);

			let depositsFilled = this._fillDeposits(uniqueDates[0], deposits);

			let prices = await this._calcWorthAtDates(uniqueDates[0], transactions, vault);
			let worth = this._calcWorth(prices, depositsFilled);

			let dailyProgress = await this._calcDailyProgress(transactions, vault);

			let transLive = await this._assignLivePrices(transactions)
			let exchangeRates = await this._getExchangeRates();
			let livePrice = this._calcCurrentWorth(transLive, exchangeRates, vault);

			let loading = false;
			this.props.loadingCallback(loading);
			this.setState({
				worth,
				transactions,
				vault,
				loading,
				deposits: depositsFilled,
				dailyProgress,
				livePrice
			});
		}

		_calcCurrentWorth = (transactions, exchRates, vault) => {
			let fees = transactions
				.map(t => t.Fees)
				.reduce((a, b) => a + b, 0);

			transactions =  transactions
				.filter(t => !this._checkIfTickerSold(t, transactions));

			let nav = transactions
				.map(t => {
					let price = t.LivePrice*t.Amount/exchRates[t.Currency];
					price /= t.Currency === 'GBP' ? 100 : 1;
					return price
				})
				.reduce((a, b) => a + b, 0)
				+ vault.sort((a, b) => b.Date - a.Date)[0].Amount
				+ fees;

			return nav;
		}

		_getOverallPlot = () => {
			let textFund = this.state.worth.map(w => {
				return (
					`<b>Total worth: €${w.Worth.toFixed(2)}</b><br />` +
					`Stocks worth: €${w.WorthStocks.toFixed(2)}<br />` +
					`Vault worth: €${w.WorthVault.toFixed(2)}<br />` +
					`Relative profit: ${w.RelProfit.toFixed(2)}%`
				);
			});

			let textInv = this.state.deposits.map(d => {
				return (
					`Investment: ${d.Deposited.toFixed(2)}`
				)
			});

			let data = [
				{
					type: 'scatter',
					x: this.state.worth.map(d => d.Date),
					y: this.state.worth.map(d => d.Worth),
					text: textFund,
					hovertemplate: "%{text}<extra></extra>",
					name: 'Fund worth',
					line: {color: '#61DBFB'}
				},
				{
					type: 'scatter',
					x: this.state.deposits.map(d => d.Date),
					y: this.state.deposits.map(d => d.Deposited),
					name: 'Investment',
					text: textInv,
					hovertemplate: "%{text}<extra></extra>"
				}
			];

			let layout = {
				paper_bgcolor: 'rgba(0, 0, 0, 0)',
				plot_bgcolor: 'rgba(0, 0, 0, 0)',
				hoverlabel: {
					bgcolor: 'rgba(0, 0, 0, 0)'
				},
				legend: {
					xanchor: 'left',
					x: 0.01,
					y: 0.99,
					font: {
						color: 'white'
					},
				},
				xaxis: {
					color: 'white',
					gridcolor: 'rgba(255, 255, 255, 0.3)'
				},
				yaxis: {
					color: 'white',
					gridcolor: 'rgba(255, 255, 255, 0.5)',
					tickprefix: '€'
				}
			}

			return <Plot data={ data } layout={ layout } config = {{ displayModeBar: false }} />;
		}

		_getDailyProgressPlot = () => {
			let textFund = this.state.dailyProgress.map(d => {
				let textStocks = !!d.Stocks ? d.Stocks
					.map(s => {
						return `${s.Ticker}: €${s.Price.toFixed(2)}<br />`;
					})
					.reduce((a, b) => a.concat(b), "") : '';

				return (
					!!d.Worth ? (
						`<b>Total worth: €${d.Worth.toFixed(2)}</b><br />` +
						`Vault worth: ${d.Vault.toFixed(2)}€<br />` +
						textStocks
					) : ''
				);
			});

			let data = [
				{
					type: 'scatter',
					x: this.state.dailyProgress.map(d => d.Date),
					y: this.state.dailyProgress.map(d => d.Worth),
					text: textFund,
					hovertemplate: "%{text}<extra></extra>",
					name: 'Fund worth',
					line: {color: '#61DBFB'}
				}
			]

			let layout = {
				paper_bgcolor: 'rgba(0, 0, 0, 0)',
				plot_bgcolor: 'rgba(0, 0, 0, 0)',
				hoverlabel: {
					bgcolor: 'rgba(0, 0, 0, 0)'
				},
				legend: {
					xanchor: 'left',
					x: 0.01,
					y: 0.99,
					font: {
						color: 'white'
					},
				},
				xaxis: {
					color: 'white',
					gridcolor: 'rgba(255, 255, 255, 0.3)'
				},
				yaxis: {
					color: 'white',
					gridcolor: 'rgba(255, 255, 255, 0.5)',
					tickprefix: '€'
				}
			}

			return <Plot data={ data } layout={ layout } config = {{ displayModeBar: false }} />;
		}

		_handlePlotChange = (_, ind) => {
			this.setState({ currentPlotTab: ind });
		}

		_renderPlot = () => {
			let plot = this.state.currentPlotTab;
			if (plot === 0)
				return this._getDailyProgressPlot()
			else if (plot === 1)
				return this._getOverallPlot()

			return 0;
		}

		_styledTabs = withStyles({
			indicator: {
					backgroundColor: '#61DBFB',
			}
		})(Tabs);

		render() {
			return (
				this.state.loading ? '' :
				(
					<div>
						<div className={ style.underheadingText }>
							Currently worth incredible €{this.state.livePrice.toFixed(2)}.<br />
							A profit of €{
								(this.state.livePrice-this.state.deposits.sort((a, b) => b.Date - a.Date)[0].Deposited)
								.toFixed(2)
							}, or {
								(((this.state.livePrice/
									this.state.deposits.sort((a, b) => b.Date - a.Date)[0].Deposited)
									-1)*100)
									.toFixed(2)
							}%.
						</div>
						<this._styledTabs value={this.state.currentPlotTab} onChange={this._handlePlotChange} centered>
							<Tab label="Today's performance" />
							<Tab label="Overall performance" />
						</this._styledTabs>
						{ this._renderPlot() }
					</div>
				)
			);
		}
}
