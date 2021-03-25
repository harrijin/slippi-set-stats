const { 
  default: SlippiGame, stages: stageUtil, moves: moveUtil, characters: characterUtil
} = require('slp-parser-js');
const util = require('util')
const moment = require('moment');
const path = require('path');
const _ = require('lodash');
const fs = require('fs');
const Jimp = require('jimp');
const stageData = {

    "8":{
        "name": "yoshis",
        "cameraMinX":-126,
        "cameraMaxX":125.3,
        "cameraMinY":-49.7,
        "cameraMaxY":118.3,
    },
    "31":{
        "name": "battlefield",
        "cameraMinX":-160,
        "cameraMaxX":160,
        "cameraMinY":-47.2,
        "cameraMaxY":136
    },
    "32":{
        "name": "fd",
        "cameraMinX":-168.25,
        "cameraMaxX":168.25,
        "cameraMinY":-75.7628865,
        "cameraMaxY":115.2371134
    },
    "2":{
        "name": "fod",
        "cameraMinX":-123.75,
        "cameraMaxX":123.75,
        "cameraMinY":-84.75,
        "cameraMaxY":112.5
    },
    "28":{
        "name": "dreamland",
        "cameraMinX":-165,
        "cameraMaxX":165,
        "cameraMinY":-81,
        "cameraMaxY":190
    },
    "3":{
        "name": "stadium",
        "cameraMinX":-170,
        "cameraMaxX":170,
        "cameraMinY":-65,
        "cameraMaxY":120
    }
}


const stats = {
  OPENINGS_PER_KILL: "openingsPerKill",
  DAMAGE_PER_OPENING: "damagePerOpening",
  NEUTRAL_WINS: "neutralWins",
  KILL_MOVES: "killMoves",
  NEUTRAL_OPENER_MOVES: "neutralOpenerMoves",
  EARLY_KILLS: "earlyKills",
  LATE_DEATHS: "lateDeaths",
  SELF_DESTRUCTS: "selfDestructs",
  INPUTS_PER_MINUTE: "inputsPerMinute",
  AVG_KILL_PERCENT: "avgKillPercent",
  HIGH_DAMAGE_PUNISHES: "highDamagePunishes",
  DAMAGE_DONE: "damageDone",
  NEUTRAL_WIN_COORDS: "neutralWinCoords",
};

const statDefininitions = {
  [stats.OPENINGS_PER_KILL]: {
    id: stats.OPENINGS_PER_KILL,
    name: "Openings / Kill",
    type: "number",
    betterDirection: "lower",
    recommendedRounding: 1,
    calculate: (games, playerIndex) => {
      return genOverallRatioStat(games, playerIndex, 'openingsPerKill', 1);
    },
  }, 
  [stats.DAMAGE_PER_OPENING]: {
    id: stats.DAMAGE_PER_OPENING,
    name: "Damage / Opening",
    type: "number",
    betterDirection: "higher",
    recommendedRounding: 1,
    calculate: (games, playerIndex) => {
      return genOverallRatioStat(games, playerIndex, 'damagePerOpening', 1);
    },
  },
  [stats.NEUTRAL_WINS]: {
    id: stats.NEUTRAL_WINS,
    name: "Neutral Wins",
    type: "number",
    betterDirection: "higher",
    recommendedRounding: 0,
    calculate: (games, playerIndex) => {
      return genOverallRatioStat(games, playerIndex, 'neutralWinRatio', 0, 'count');
    },
  },
  [stats.KILL_MOVES]: {
    id: stats.KILL_MOVES,
    name: "Most Common Kill Move",
    type: "text",
    calculate: (games, playerIndex) => {
      const killMoves = _.flatMap(games, game => {
        const conversions = _.get(game, ['stats', 'conversions']) || [];
        const conversionsForPlayer = _.filter(conversions, conversion => {
          const isForPlayer = conversion.playerIndex === playerIndex;
          const didKill = conversion.didKill;
          return isForPlayer && didKill;
        });

        return _.map(conversionsForPlayer, conversion => {
          return _.last(conversion.moves);
        });
      });

      const killMovesByMove = _.groupBy(killMoves, 'moveId');
      const killMoveCounts = _.map(killMovesByMove, moves => {
        const move = _.first(moves);
        return {
          count: moves.length,
          id: move.moveId,
          name: moveUtil.getMoveName(move.moveId),
          shortName: moveUtil.getMoveShortName(move.moveId),
        };
      });

      const orderedKillMoveCounts = _.orderBy(killMoveCounts, ['count'], ['desc']);
      const topKillMove = _.first(orderedKillMoveCounts);
      let simpleText = "N/A";
      if (topKillMove) {
        simpleText = `${topKillMove.shortName} (${topKillMove.count})`;
      }

      return {
        result: orderedKillMoveCounts,
        simple: {
          text: simpleText, 
        }
      }
    },
  },
  [stats.NEUTRAL_OPENER_MOVES]: {
    id: stats.NEUTRAL_OPENER_MOVES,
    name: "Most Common Neutral Opener",
    type: "text",
    calculate: (games, playerIndex) => {
      const neutralMoves = _.flatMap(games, game => {
        const conversions = _.get(game, ['stats', 'conversions']) || [];
        const conversionsForPlayer = _.filter(conversions, conversion => {
          const isForPlayer = conversion.playerIndex === playerIndex;
          const isNeutralWin = conversion.openingType === 'neutral-win';
          return isForPlayer && isNeutralWin;
        });

        return _.map(conversionsForPlayer, conversion => {
          return _.first(conversion.moves);
        });
      });

      // TODO: This following code is repeated from kill move code, put in function

      const neutralMovesByMove = _.groupBy(neutralMoves, 'moveId');
      const neutralMoveCounts = _.map(neutralMovesByMove, moves => {
        const move = _.first(moves);
        return {
          count: moves.length,
          id: move.moveId,
          name: moveUtil.getMoveName(move.moveId),
          shortName: moveUtil.getMoveShortName(move.moveId),
        };
      });

      const orderedNeutralMoveCounts = _.orderBy(neutralMoveCounts, ['count'], ['desc']);
      const topNeutralMove = _.first(orderedNeutralMoveCounts);
      let simpleText = "N/A";
      if (topNeutralMove) {
        simpleText = `${topNeutralMove.shortName} (${topNeutralMove.count})`;
      }

      return {
        result: orderedNeutralMoveCounts,
        simple: {
          text: simpleText, 
        }
      }
    },
  }, 
  [stats.EARLY_KILLS]: {
    id: stats.EARLY_KILLS,
    name: "Earliest Kill",
    type: "number",
    betterDirection: "lower",
    recommendedRounding: 1,
    calculate: (games, playerIndex) => {
      const oppStocks = _.flatMap(games, game => {
        const stocks = _.get(game, ['stats', 'stocks']) || [];
        return _.filter(stocks, stock => {
          const isOpp = stock.playerIndex !== playerIndex;
          const hasEndPercent = stock.endPercent !== null;
          return isOpp && hasEndPercent;
        });
      });

      const orderedOppStocks = _.orderBy(oppStocks, ['endPercent'], ['asc']);
      const earliestKillStock = _.first(orderedOppStocks);
      const simple = {
        text: "N/A",
        number: null,
      };

      if (earliestKillStock) {
        simple.number = earliestKillStock.endPercent;
        simple.text = simple.number.toFixed(1);
      }

      return {
        result: _.take(orderedOppStocks, 5),
        simple: simple,
      };
    },
  },
  [stats.LATE_DEATHS]: {
    id: stats.LATE_DEATHS,
    name: "Latest Death",
    type: "number",
    betterDirection: "higher",
    recommendedRounding: 1,
    calculate: (games, playerIndex) => {
      const playerStocks = _.flatMap(games, game => {
        const stocks = _.get(game, ['stats', 'stocks']) || [];
        return _.filter(stocks, stock => {
          const isPlayer = stock.playerIndex === playerIndex;
          const hasEndPercent = stock.endPercent !== null;
          return isPlayer && hasEndPercent;
        });
      });

      const orderedPlayerStocks = _.orderBy(playerStocks, ['endPercent'], ['desc']);
      const latestDeathStock = _.first(orderedPlayerStocks);
      const simple = {
        text: "N/A",
        number: null,
      };

      if (latestDeathStock) {
        simple.number = latestDeathStock.endPercent;
        simple.text = simple.number.toFixed(1);
      }

      return {
        result: _.take(orderedPlayerStocks, 5),
        simple: simple,
      };
    },
  },
  [stats.SELF_DESTRUCTS]: {
    id: stats.SELF_DESTRUCTS, // Only show this one if greater than 2 for one player
    name: "Total Self-Destructs",
    type: "number",
    betterDirection: "lower",
    recommendedRounding: 0,
    calculate: (games, playerIndex) => {
      const sdCounts = _.map(games, game => {
        const stocks = _.get(game, ['stats', 'stocks']) || [];
        const playerEndedStocks = _.filter(stocks, stock => {
          const isPlayer = stock.playerIndex === playerIndex;
          const hasEndPercent = stock.endPercent !== null;
          return isPlayer && hasEndPercent;
        });

        const conversions = _.get(game, ['stats', 'conversions']) || [];
        const oppKillConversions = _.filter(conversions, conversion => {
          const isOpp = conversion.playerIndex !== playerIndex;
          const didKill = conversion.didKill;
          return isOpp && didKill;
        });

        return playerEndedStocks.length - oppKillConversions.length;
      });

      const sdSum = _.sum(sdCounts);
      
      return {
        result: sdSum,
        simple: {
          number: sdSum,
          text: `${sdSum}`,
        },
      };
    },
  },
  [stats.INPUTS_PER_MINUTE]: {
    id: stats.INPUTS_PER_MINUTE,
    name: "Inputs / Minute",
    type: "number",
    betterDirection: "higher",
    recommendedRounding: 1,
    calculate: (games, playerIndex) => {
      return genOverallRatioStat(games, playerIndex, 'inputsPerMinute', 1);
    },
  },
  [stats.AVG_KILL_PERCENT]: {
    id: stats.AVG_KILL_PERCENT,
    name: "Average Kill Percent",
    type: "number",
    betterDirection: "lower",
    recommendedRounding: 1,
    calculate: (games, playerIndex) => {
      const oppStocks = _.flatMap(games, game => {
        const stocks = _.get(game, ['stats', 'stocks']) || [];
        return _.filter(stocks, stock => {
          const isOpp = stock.playerIndex !== playerIndex;
          const hasEndPercent = stock.endPercent !== null;
          return isOpp && hasEndPercent;
        });
      });

      const result = {
        total: oppStocks.length,
        count: _.sumBy(oppStocks, 'endPercent') || 0,
      };

      result.ratio = result.total ? result.count / result.total : null;

      return {
        result: result,
        simple: genSimpleFromRatio(result, 1),
      };
    },
  },
  [stats.HIGH_DAMAGE_PUNISHES]: {
    id: stats.HIGH_DAMAGE_PUNISHES,
    name: "Highest Damage Punish",
    type: "number",
    betterDirection: "higher",
    recommendedRounding: 1,
    calculate: (games, playerIndex) => {
      const punishes = _.flatMap(games, game => {
        const conversions = _.get(game, ['stats', 'conversions']) || [];
        return _.filter(conversions, conversion => {
          const isForPlayer = conversion.playerIndex === playerIndex;
          const hasEndPercent = conversion.endPercent !== null;
          return isForPlayer && hasEndPercent;
        });
      });

      const getDamageDone = punish => punish.endPercent - punish.startPercent;
      const orderedPunishes = _.orderBy(punishes, [getDamageDone], 'desc');
      const topPunish = _.first(orderedPunishes);
      const simple = {
        text: "N/A",
        number: null,
      };

      if (topPunish) {
        simple.number = getDamageDone(topPunish);
        simple.text = simple.number.toFixed(1);
      }

      return {
        result: _.take(orderedPunishes, 5),
        simple: simple,
      };
    },
  },
  [stats.DAMAGE_DONE]: {
    id: stats.DAMAGE_DONE,
    name: "Total Damage Done",
    type: "number",
    betterDirection: "higher",
    recommendedRounding: 1,
    calculate: (games, playerIndex) => {
      return genOverallRatioStat(games, playerIndex, 'damagePerOpening', 1, 'count');
    },
  },
  [stats.NEUTRAL_WIN_COORDS]: {
    id: stats.NEUTRAL_WIN_COORDS,
    name: "Neutral Win Coordinates",
    calculate: (games, playerIndex) => {
      const neutralMoves = _.flatMap(games, game => {
        const players = _.get(game.settings, ['players']);
        const player = _.find(players, {'playerIndex':playerIndex});
        const gameId = _.get(game, ['metadata', 'startAt']);
        const frames = _.get(game, ['frames']);
        const conversions = _.get(game, ['stats', 'conversions']) || [];
        const conversionsForPlayer = _.filter(conversions, conversion => {
          const isForPlayer = conversion.playerIndex === playerIndex;
          // const isNeutralWin = conversion.openingType === 'neutral-win';
          return isForPlayer;
        });
        return _.map(conversionsForPlayer, conversion => {
          var output = _.first(conversion.moves);
          output.frameData = frames[output.frame];
          output.openingType = conversion.openingType;
          output.stageId = game.settings.stageId;
          output.gameId = gameId;
          // Check if sheik or zelda
          if(player.characterId === 18 || player.characterId === 19){
            output.shielda = true;
          }
          return output;
        });
      });

      const neutralMoveCoords = _.map(neutralMoves, move => {
        output = {
          x: move.frameData.players[playerIndex].pre.positionX,
          y: move.frameData.players[playerIndex].pre.positionY,
          id: move.moveId,
          name: moveUtil.getMoveName(move.moveId),
          shortName: moveUtil.getMoveShortName(move.moveId),
          stageId: move.stageId,
          openingType: move.openingType,
          gameId: move.gameId
        };
        if(move.shielda){
          if(move.frameData.players[playerIndex].post.internalCharacterId === 7){
            output.isZelda = false;
          }else{
            output.isZelda = true;
          }
        }
        return output;
      });

      // Aggregate by stage
      // const groupedCoords = _.groupBy(neutralMoveCoords, 'stageId');
      // Group by game
      const groupedCoords = _.groupBy(neutralMoveCoords, 'gameId');
      return groupedCoords
    },
  }, 
}

function genOverallRatioStat(games, playerIndex, field, fixedNum, type = "ratio") {
  const statRatios = _.map(games, (game) => {
    const overallStats = _.get(game, ['stats', 'overall']);
    const overallStatsByPlayer = _.keyBy(overallStats, 'playerIndex');
    const overallStatsForPlayer = overallStatsByPlayer[playerIndex];
    return overallStatsForPlayer[field];
  });

  const avg = averageRatios(statRatios);
  const simple = genSimpleFromRatio(avg, fixedNum, type);

  return {
    result: avg,
    simple: simple,
  };
}

function averageRatios(ratios) {
  const result = {};

  result.count = _.sumBy(ratios, 'count') || 0;
  result.total = _.sumBy(ratios, 'total') || 0;
  result.ratio = result.total ? result.count / result.total : null;

  return result;
}

function genSimpleFromRatio(ratio, fixedNum, type = "ratio") {
  const result = {};

  switch (type) {
    case 'ratio':
      result.number = ratio.ratio;
      result.text = ratio.ratio !== null ? ratio.ratio.toFixed(fixedNum) : "N/A";
      break;
    case 'count':
      result.number = ratio.count;
      result.text = ratio.count.toFixed(fixedNum);
      break;
  }
  
  return result;
}

function parseFilesInFolder() {
  const dirPath = process.cwd();
  const dirContents = fs.readdirSync(dirPath, { withFileTypes: true });

  console.log("Reading files in directory...\n");
  const gameDetails = _.chain(dirContents).filter((item) => {
    return item.isFile() && path.extname(item.name) === ".slp";
  }).map((slpItem) => {
    const slpFilePath = path.join(dirPath, slpItem.name);
    const game = new SlippiGame(slpFilePath);
    return {
      filePath: slpFilePath,
      settings: game.getSettings(),
      frames: game.getFrames(),
      stats: game.getStats(),
      metadata: game.getMetadata(),
      latestFrame: game.getLatestFrame(),
      gameEnd: game.getGameEnd(),
    };
  }).value();

  return gameDetails;
}

function filterGames(games) {
  // console.log(games);
  const gamesByIsSingles = _.groupBy(games, (game) => {
    const numberOfPlayers = game.settings.players.length;
    return numberOfPlayers === 2;
  });

  const nonSinglesGames = _.get(gamesByIsSingles, false) || [];
  if (_.some(nonSinglesGames)) {
    console.log("The following games have been excluded because they are not singles games:");
    _.forEach(nonSinglesGames, (game) => {
      console.log(game.filePath);
    });
    console.log();
  }

  const singlesGames = _.get(gamesByIsSingles, true) || [];
  const gamesByPorts = _.chain(singlesGames).groupBy((game) => {
    const ports = _.map(game.settings.players, 'port');
    return _.join(ports, '-');
  }).orderBy(['length'], ['desc']).value();

  const gamesWithSamePorts = gamesByPorts.shift();
  if (_.some(gamesByPorts)) {
    console.log("The following games have been excluded because the player ports differ:");
    const flatGames = _.flatten(gamesByPorts);
    _.forEach(flatGames, (game) => {
      console.log(game.filePath);
    });
    console.log();
  }

  if (_.isEmpty(gamesWithSamePorts)) {
    throw new Error("There were no valid games found to compute stats from.");
  }

  console.log(`Including ${gamesWithSamePorts.length} games for stat calculation...`);

  return gamesWithSamePorts;
}

function computeStats(games) {
  const firstGame = _.first(games);
  // console.log(firstGame);
  const orderIndices = _.map(firstGame.settings.players, 'playerIndex');
  const reversedIndices = _.chain(orderIndices).clone().reverse().value();
  const indices = [orderIndices, reversedIndices];

  const statResults = _.flatMap(stats, statKey => {
    const def = statDefininitions[statKey];
    if (!def.calculate) {
      return [];
    }

    const results = _.map(indices, (iIndices) => {
      const result = def.calculate(games, iIndices[0], iIndices[1]);
      result.port = iIndices[0] + 1;
      return result;
    });

    const output = { ...def };
    delete output.calculate;
    output.results = results;

    return [output];
  });

  return statResults;
}

function generateGameInfo(games) {
  const getStartAt = (game) => game.metadata.startAt;
  const orderedGames = _.orderBy(games, [getStartAt], ['asc']);

  const getResultForPlayer = (game, playerIndex) => {
    // console.log(game);
    // Calculate assumed game result
    const gameEnd = game.gameEnd;
    if (!gameEnd) {
      return "unknown";
    }

    const players = _.get(game.settings, ['players']);
    const opp = _.filter(players, player => player.playerIndex !== playerIndex);
    const oppIndex = _.get(opp, [0, 'playerIndex']);

    switch (gameEnd.gameEndMethod) {
      case 1:
        // This is a TIME! ending, not implemented yet
        return "unknown";
      case 2:
        // This is a GAME! ending
        const latestFrame = _.get(game.latestFrame, 'players') || [];
        const playerStocks = _.get(latestFrame, [playerIndex, 'post', 'stocksRemaining']);
        const oppStocks = _.get(latestFrame, [oppIndex, 'post', 'stocksRemaining']);
        if (playerStocks === 0 && oppStocks === 0) {
          return "unknown";
        }

        return playerStocks === 0 ? "loser" : "winner";
      case 7:
        return gameEnd.lrasInitiatorIndex === playerIndex ? "loser" : "winner";
    }

    return "unknown";
  };

  const generatePlayerInfo = game => player => {
    // console.log(player);
    return {
      port: player.port,
      characterId: player.characterId,
      characterColor: player.characterColor,
      nametag: player.nametag,
      characterName: characterUtil.getCharacterName(player.characterId),
      characterColor: characterUtil.getCharacterColorName(player.characterId, player.characterColor),
      gameResult: getResultForPlayer(game, player.playerIndex),
    };
  };

  return _.map(orderedGames, (game) => {
    const playerInfoGen = generatePlayerInfo(game);

    return {
      stage: {
        id: game.settings.stageId,
        name: stageUtil.getStageName(game.settings.stageId),
      },
      players: _.map(game.settings.players, playerInfoGen),
      startTime: game.metadata.startAt,
      duration: convertFrameCountToDurationString(game.stats.lastFrame),
    }
  });
}

function generateBtsSummary(summary) {
  const fixedStats = [
    stats.KILL_MOVES,
    stats.NEUTRAL_OPENER_MOVES,
    stats.OPENINGS_PER_KILL,
    stats.DAMAGE_DONE,
  ];

  const randomizeCount = 2;

  const generateSummaryItem = fullStatOutput => {
    const type = fullStatOutput.type;

    const output = { ...fullStatOutput };
    output.results = _.map(fullStatOutput.results, result => _.get(result, ['simple', type]));

    return output;
  };

  const result = [];

  const statsById = _.keyBy(summary, 'id');
  const statsToRandomizeById = statsById;
  
  // Add fixed stats
  _.forEach(fixedStats, statId => {
    const statOutput = statsById[statId];
    result.push(generateSummaryItem(statOutput));

    delete statsToRandomizeById[statId];
  });

  // Deal with SDs
  const sdStat = statsById[stats.SELF_DESTRUCTS];
  const sds1 = sdStat.results[0].simple.number;
  const sds2 = sdStat.results[0].simple.number;
  const shouldIncludeSds = sds1 > 1 || sds2 > 1;
  if (!shouldIncludeSds) {
    delete statsToRandomizeById[stats.SELF_DESTRUCTS];
  }

  const shuffled = _.shuffle(statsToRandomizeById);
  const shuffledToInclude = _.take(shuffled, randomizeCount);
  _.forEach(shuffledToInclude, statOutput => {
    result.push(generateSummaryItem(statOutput));
  });

  return result;
}

function convertFrameCountToDurationString(frameCount) {
  const duration = moment.duration(frameCount / 60, 'seconds');
  return moment.utc(duration.as('milliseconds')).format('m:ss');
}

function generateOutput(games) {
  const stats = computeStats(games);
  
  return {
    games: generateGameInfo(games),
    summary: stats,
    btsSummary: generateBtsSummary(stats),
  };
}

function writeToFile(output) {
  // console.log(util.inspect(output, { depth: 6, colors: true }));
  fs.writeFileSync('output.json', JSON.stringify(output));
  console.log("Finished writing stats to output.json!");
}

async function generateImages(output){
  //generate neutral wins image
  var coords; 
  for (var i = 0; i < output.summary.length; i++){
    if(output.summary[i].id == "neutralWinCoords"){
      coords = output.summary[i].results;
      break;
    }
  }
  const port0 = coords[0].port;
  var character0; 
  var color0;
  var character1;
  var color1;
  for(var i = 0; i < 2; i++){
    if(output.games[0].players[i].port == port0){
      character0 = output.games[0].players[i].characterName;
      color0 = output.games[0].players[i].characterColor;
    }else{
      character1 = output.games[0].players[i].characterName;
      color1 = output.games[0].players[i].characterColor;
    }
  }
  character0 = character0.toLowerCase();
  character1 = character1.toLowerCase();
  color0 = color0.toLowerCase();
  color1 = color1.toLowerCase();
  const iconSize = 72;
  const stockIcon0 = await (await Jimp.read(path.join(__dirname, "stock-icons/" + character0 + "-" + color0 +".png"))).resize(iconSize, iconSize);
  const stockIcon1 = await (await Jimp.read(path.join(__dirname, "stock-icons/" + character1 + "-" + color1 + ".png"))).resize(iconSize, iconSize);
  delete coords[0].port;
  games = []
  for(var key in coords[0]){
    if(coords[0].hasOwnProperty(key)){
      games.push(key);
    }
  }
  games.sort();

  for(var gameNum = 0; gameNum < games.length; gameNum++){
    const gameId = games[gameNum];
    var game = coords[0][gameId];
    const stageId = game[0].stageId; 
    var stageImage = await Jimp.read(path.join(__dirname, "stage-images/" + (stageId) + ".png"))
    // stageImage.composite(stockIcon0, 0, 0, Jimp.BLEND_SOURCE_OVER, 0.5, 1);
    const stageInfo = stageData[stageId];

    for(var i = 0; i < game.length; i++){
      // add stock icons to stage image
      if(game[i].openingType == 'neutral-win'){
        const convertedX = (game[i].x - stageInfo.cameraMinX)/(stageInfo.cameraMaxX-stageInfo.cameraMinX)*stageImage.getWidth();
        const convertedY = (stageInfo.cameraMaxY - game[i].y)/(stageInfo.cameraMaxY-stageInfo.cameraMinY)*stageImage.getHeight();
        if(game[i].isZelda && character0 === 'sheik' ){
          const zeldaIcon = await(await Jimp.read(path.join(__dirname, "stock-icons/zelda-" + color0 + ".png"))).resize(iconSize, iconSize);
          stageImage.composite(zeldaIcon, convertedX-iconSize/2, convertedY-iconSize, {opacitySource:0.5});
        }else if(character0 === 'zelda' && !game[i].isZelda){
          const sheikIcon = await(await Jimp.read(path.join(__dirname, "stock-icons/sheik-" + color0 + ".png"))).resize(iconSize, iconSize);
          stageImage.composite(sheikIcon, convertedX-iconSize/2, convertedY-iconSize, {opacitySource:0.5});
        }else{
          stageImage.composite(stockIcon0, convertedX-iconSize/2, convertedY-iconSize, {opacitySource:0.5});
        }
      }
    }
    game = coords[1][gameId];

    for(var i = 0; i < game.length; i++){
      if(game[i].openingType == 'neutral-win'){
        const convertedX = (game[i].x - stageInfo.cameraMinX)/(stageInfo.cameraMaxX-stageInfo.cameraMinX)*stageImage.getWidth();
        const convertedY = (stageInfo.cameraMaxY - game[i].y)/(stageInfo.cameraMaxY-stageInfo.cameraMinY)*stageImage.getHeight();
        if(game[i].isZelda && character1 === 'sheik' ){
          const zeldaIcon = await(await Jimp.read(path.join(__dirname, "stock-icons/zelda-" + color1 + ".png"))).resize(iconSize, iconSize);
          stageImage.composite(zeldaIcon, convertedX-iconSize/2, convertedY-iconSize, {opacitySource:0.5});
        }else if(character1 === 'zelda' && !game[i].isZelda){
          const sheikIcon = await(await Jimp.read(path.join(__dirname, "stock-icons/sheik-" + color1 + ".png"))).resize(iconSize, iconSize);
          stageImage.composite(sheikIcon, convertedX-stockIcon0.iconSize/2, convertedY-iconSize, {opacitySource:0.5});
        }else{
          stageImage.composite(stockIcon1, convertedX-iconSize/2, convertedY-iconSize, {opacitySource:0.5});
        }
      }
    }
    stageImage.autocrop(0, false);
    // save image 
    console.log("Writing image game" + (gameNum+1) + ".png");
    stageImage.write("game" + (gameNum+1) + ".png");
  }
  // console.log(JSON.stringify(coords));
  
}

module.exports = async function () {
  const games = parseFilesInFolder();
  const filteredGames = filterGames(games);
  const output = generateOutput(filteredGames);
  writeToFile(output);
  await generateImages(output);
};
