(function setupPublicEvents(global) {
  const PUBLIC_EVENT_POOL = [
    {
      id: "evt-market-rumor-jade",
      text: "市场传闻：近期玉器行情看涨，部分收藏家正高价收购玉器藏品。",
      category: "市场传闻"
    },
    {
      id: "evt-market-rumor-bronze",
      text: "市场传闻：铜器市场近期波动较大，部分铜器估值可能被低估。",
      category: "市场传闻"
    },
    {
      id: "evt-auction-house-tip",
      text: "拍卖行消息：本局仓库中至少存在一件传世级藏品。",
      category: "拍卖行消息"
    },
    {
      id: "evt-expert-review",
      text: "专家点评：本局仓库整体品质偏中上，值得仔细探查。",
      category: "专家点评"
    },
    {
      id: "evt-collector-intel",
      text: "收藏家情报：听说本局仓库中有大件藏品，占据多格空间。",
      category: "收藏家情报"
    },
    {
      id: "evt-warehouse-inspector",
      text: "仓库检查员透露：本局仓库藏品种类丰富，涵盖多个品类。",
      category: "仓库检查员"
    },
    {
      id: "evt-rival-scout",
      text: "对手探子回报：有竞争者对本局仓库表现出浓厚兴趣，可能出价积极。",
      category: "对手探子"
    },
    {
      id: "evt-antique-dealer",
      text: "古董商私语：本局仓库中某些藏品可能存在隐藏价值，品质超出表面所见。",
      category: "古董商私语"
    },
    {
      id: "evt-insurance-report",
      text: "保险报告：本局仓库的投保金额较高，暗示整体价值不菲。",
      category: "保险报告"
    },
    {
      id: "evt-warehouse-history",
      text: "仓库历史：此仓库曾存放过一批珍贵文物，部分藏品可能留存至今。",
      category: "仓库历史"
    }
  ];

  function pickRandomPublicEvent() {
    const index = Math.floor(Math.random() * PUBLIC_EVENT_POOL.length);
    return { ...PUBLIC_EVENT_POOL[index] };
  }

  global.PublicEventSystem = {
    PUBLIC_EVENT_POOL,
    pickRandomPublicEvent
  };
})(window);
