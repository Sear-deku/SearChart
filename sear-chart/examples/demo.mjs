const days = Array.from({ length: 14 }, (_, index) => `第${index + 1}天`);
const stages = ['起步', '起步', '起步', '适应', '适应', '适应', '适应', '成长', '成长', '成长', '成长', '稳定', '稳定', '稳定'];

const report = {
  title: '14天成长与活动表现',
  description: '全部数值均为合成数据，用于演示同屏比较、正负贡献及关联指标。',
  theme: {
    fontFamily: '"Microsoft YaHei", "PingFang SC", Arial, sans-serif',
    titleSize: 16,
    axisSize: 12,
    legendSize: 12,
    labelSize: 12,
  },
  rowHeight: 360,
  gap: 24,
  rows: [
    {
      charts: [{
        id: 'contributions',
        title: '来源贡献 · 获取与消耗',
        type: 'stacked',
        stackMode: 'diverging',
        categories: days,
        contexts: stages,
        y: { unit: 'percent', domain: [-0.6, 1] },
        legend: { placement: 'right' },
        series: [
          { key: 'campaign', name: '主题活动', group: '活动获取', emphasis: 'focus', color: '#087f8c', unit: 'percent', values: [0.22, 0.24, 0.25, 0.26, 0.28, 0.27, 0.25, 0.26, 0.28, 0.3, 0.29, 0.31, 0.3, 0.28] },
          { key: 'checkin', name: '活动签到', group: '活动获取', emphasis: 'focus', color: '#21a8a0', unit: 'percent', values: [0.07, 0.07, 0.08, 0.08, 0.08, 0.07, 0.08, 0.08, 0.09, 0.08, 0.08, 0.09, 0.08, 0.08] },
          { key: 'invites', name: '邀请奖励', group: '活动获取', emphasis: 'focus', color: '#55bfae', unit: 'percent', values: [0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.09, 0.1, 0.11, 0.12, 0.11, 0.11, 0.1, 0.1] },
          { key: 'challenge', name: '挑战奖励', group: '活动获取', emphasis: 'focus', color: '#8ed5c0', unit: 'percent', values: [0.03, 0.04, 0.04, 0.05, 0.06, 0.05, 0.06, 0.06, 0.07, 0.07, 0.07, 0.08, 0.08, 0.07] },
          { key: 'upgrades', name: '成长升级', group: '活动消耗', emphasis: 'focus', color: '#c65b29', unit: 'percent', values: [-0.14, -0.15, -0.16, -0.17, -0.18, -0.18, -0.19, -0.2, -0.21, -0.22, -0.25, -0.23, -0.22, -0.21] },
          { key: 'exchange', name: '商店兑换', group: '活动消耗', emphasis: 'focus', color: '#e68a43', unit: 'percent', values: [-0.06, -0.06, -0.07, -0.07, -0.08, -0.09, -0.09, -0.1, -0.1, -0.11, -0.12, -0.11, -0.1, -0.1] },
          { key: 'entry', name: '挑战入场', group: '活动消耗', emphasis: 'focus', color: '#f2b578', unit: 'percent', values: [-0.02, -0.03, -0.03, -0.03, -0.04, -0.04, -0.04, -0.04, -0.05, -0.05, -0.06, -0.05, -0.05, -0.04] },
          { key: 'daily', name: '日常任务', group: '常规来源', emphasis: 'context', color: '#a4afb9', unit: 'percent', values: [0.09, 0.09, 0.1, 0.1, 0.11, 0.1, 0.1, 0.1, 0.11, 0.11, 0.1, 0.11, 0.1, 0.1] },
          { key: 'passive', name: '自然积累', group: '常规来源', emphasis: 'context', color: '#bbc3cb', unit: 'percent', values: [0.04, 0.04, 0.05, 0.05, 0.05, 0.05, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06] },
          { key: 'routine', name: '常规消耗', group: '常规来源', emphasis: 'context', color: '#d0d6dc', unit: 'percent', values: [-0.03, -0.03, -0.03, -0.04, -0.04, -0.04, -0.04, -0.04, -0.04, -0.05, -0.05, -0.05, -0.04, -0.04] },
        ],
        labels: [
          { series: 'campaign', index: 4, text: '+28%' },
          { series: 'upgrades', index: 10, text: '−25%' },
          { series: 'campaign', index: 11, text: '+31%' },
        ],
      }],
    },
    {
      charts: [
        {
          id: 'completion',
          title: '任务完成率 · 人群比较',
          type: 'bar',
          categories: ['新客', '回流', '活跃', '付费'],
          y: { unit: 'percent', domain: [0, 1] },
          legend: { placement: 'row' },
          series: [{ key: 'completion-rate', name: '完成率', color: '#087f8c', unit: 'percent', values: [0.73, 0.62, 0.86, 0.91] }],
          labels: [
            { series: 'completion-rate', index: 0 },
            { series: 'completion-rate', index: 1 },
            { series: 'completion-rate', index: 2 },
            { series: 'completion-rate', index: 3 },
          ],
        },
        {
          id: 'retention',
          title: '留存走势 · 来源比较',
          type: 'line',
          categories: days,
          contexts: stages,
          y: { unit: 'percent', domain: [0, 1] },
          legend: { placement: 'row' },
          series: [
            { key: 'organic-retention', name: '自然来源', color: '#426b9c', unit: 'percent', values: [1, 0.73, 0.65, 0.6, 0.57, 0.54, 0.52, 0.5, 0.48, 0.46, 0.45, 0.44, 0.43, 0.42] },
            { key: 'campaign-retention', name: '活动来源', color: '#087f8c', unit: 'percent', values: [1, 0.78, 0.7, 0.66, 0.64, 0.62, 0.61, 0.47, 0.58, 0.57, 0.56, 0.55, 0.54, 0.53] },
            { key: 'invite-retention', name: '邀请来源', color: '#c65b29', dash: true, unit: 'percent', values: [1, 0.83, 0.76, 0.72, 0.7, 0.68, 0.67, 0.65, 0.64, 0.63, 0.62, 0.62, 0.61, 0.6] },
          ],
          labels: [{ series: 'campaign-retention', index: 7, text: '47% · 异常' }],
        },
      ],
    },
    {
      charts: [{
        id: 'activity',
        title: '活动参与比例与对应人数',
        type: 'combo',
        categories: days,
        contexts: stages,
        y: { unit: 'percent', domain: [0, 1] },
        secondaryY: { unit: 'number', domain: [0, 2500], visible: false },
        legend: { placement: 'row' },
        series: [
          { key: 'participants', name: '参与人数', unit: 'number', kind: 'bar', axis: 'secondary', color: '#c3d2df', values: [620, 670, 710, 760, 810, 850, 890, 920, 980, 1030, 1080, 1140, 1180, 1220] },
          { key: 'participation-rate', name: '参与比例', unit: 'percent', kind: 'line', axis: 'primary', color: '#087f8c', values: [0.46, 0.49, 0.51, 0.54, 0.57, 0.59, 0.61, 0.63, 0.65, 0.67, 0.69, 0.71, 0.72, 0.73] },
        ],
        labels: days.map((_, index) => ({ series: 'participants', index })),
      }],
    },
  ],
};

export default report;
