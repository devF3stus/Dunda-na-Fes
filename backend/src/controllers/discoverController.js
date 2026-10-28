const {
  searchOpenMusic,
  downloadDiscoverTrackToStaging,
} = require('../services/discoverService');

async function handleSearchDiscover(req, res, next) {
  try {
    const query = req.query.q || req.query.query || '';
    const source = req.query.source || 'both';
    const limit = Number.parseInt(req.query.limit || '10', 10) || 10;

    const { items, warnings } = await searchOpenMusic({
      query,
      source,
      limit,
    });

    res.status(200).json({
      query: String(query).trim(),
      source,
      total: items.length,
      items,
      warnings,
    });
  } catch (err) {
    next(err);
  }
}

async function handleStageDiscoveredTrack(req, res, next) {
  try {
    const { title, artist, audioUrl, licenseInfo } = req.body || {};
    const staged = await downloadDiscoverTrackToStaging({
      title,
      artist,
      audioUrl,
      licenseInfo,
    });

    res.status(201).json({ item: staged });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleSearchDiscover,
  handleStageDiscoveredTrack,
};
