const ENDPOINT = 'https://api.github.com/graphql';

const QUERY = `
query ProfileAnalytics($login: String!, $cursor: String) {
  user(login: $login) {
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      restrictedContributionsCount
    }
    repositories(first: 100, after: $cursor, ownerAffiliations: OWNER, isFork: false) {
      nodes {
        languages(first: 20, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { name color } }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

function finiteNonNegative(value, field) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid aggregate field: ${field}`);
  return value;
}

function parsePage(payload) {
  if (payload?.errors?.length) throw new Error('GitHub GraphQL returned errors');
  const user = payload?.data?.user;
  const contributions = user?.contributionsCollection;
  const repositories = user?.repositories;
  if (!contributions || !Array.isArray(repositories?.nodes) || !repositories.pageInfo) {
    throw new Error('GitHub GraphQL returned an invalid aggregate shape');
  }
  const totals = {
    totalCommits: finiteNonNegative(contributions.totalCommitContributions, 'totalCommits'),
    totalPullRequests: finiteNonNegative(contributions.totalPullRequestContributions, 'totalPullRequests'),
    totalIssues: finiteNonNegative(contributions.totalIssueContributions, 'totalIssues'),
    restrictedContributions: finiteNonNegative(contributions.restrictedContributionsCount, 'restrictedContributions'),
  };
  const languages = [];
  for (const repository of repositories.nodes) {
    if (!Array.isArray(repository?.languages?.edges)) throw new Error('GitHub GraphQL returned invalid language aggregates');
    for (const edge of repository.languages.edges) {
      if (typeof edge?.node?.name !== 'string') throw new Error('GitHub GraphQL returned an invalid language name');
      languages.push({
        name: edge.node.name,
        bytes: finiteNonNegative(edge.size, 'language bytes'),
        color: typeof edge.node.color === 'string' ? edge.node.color : null,
      });
    }
  }
  return { totals, languages, pageInfo: repositories.pageInfo };
}

export async function fetchAnalytics(fetchImpl, token, login = 'Yurisin') {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  if (!token) throw new Error('PROFILE_STATS_TOKEN is required');
  if (login !== 'Yurisin') throw new Error('Unexpected profile login');

  let cursor = null;
  let totals;
  const languageTotals = new Map();
  do {
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'Yurisin-profile-analytics' },
      body: JSON.stringify({ query: QUERY, variables: { login, cursor } }),
    });
    if (!response?.ok) throw new Error(`GitHub GraphQL request failed (${response?.status ?? 'unknown'})`);
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error('GitHub GraphQL returned invalid JSON');
    }
    const page = parsePage(payload);
    totals ??= page.totals;
    for (const language of page.languages) {
      const prior = languageTotals.get(language.name) ?? { name: language.name, bytes: 0, color: language.color };
      prior.bytes += language.bytes;
      prior.color ??= language.color;
      languageTotals.set(language.name, prior);
    }
    if (page.pageInfo.hasNextPage && !page.pageInfo.endCursor) throw new Error('GitHub GraphQL pagination cursor is missing');
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);

  return {
    ...totals,
    languages: [...languageTotals.values()].sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name)),
  };
}

