const Group = require('../models/Group');
const Activity = require('../models/Activity');
const { asyncHandler } = require('../middleware/error');

const NOTIFICATION_LIMIT = 30;

/** The notification feed is just Activity, scoped to the caller's groups and with the
 *  caller's own actions filtered out — nobody needs to be notified about themselves. */
const listNotifications = asyncHandler(async (req, res) => {
  const groups = await Group.find({ 'members.user': req.user._id }).select('_id');
  const groupIds = groups.map((g) => g._id);

  const notifications = await Activity.find({
    group: { $in: groupIds },
    actor: { $ne: req.user._id }
  })
    .populate('group', 'name icon photo')
    .sort({ createdAt: -1 })
    .limit(NOTIFICATION_LIMIT);

  const seenAt = req.user.notificationsSeenAt || new Date(0);
  const unreadCount = notifications.filter((n) => n.createdAt > seenAt).length;

  res.json({ notifications, unreadCount, seenAt });
});

const markNotificationsSeen = asyncHandler(async (req, res) => {
  req.user.notificationsSeenAt = new Date();
  await req.user.save();
  res.json({ seenAt: req.user.notificationsSeenAt });
});

module.exports = { listNotifications, markNotificationsSeen };
