import * as readline from 'readline';
import { SearchService, samplePeople, sampleOrganizations } from './search-implementation-new';
import { SearchQuery } from './types/index';

const service = new SearchService(samplePeople, sampleOrganizations);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('--- Search Service CLI ---');
console.log('Enter a search query (or "exit" to quit).');
console.log('Format: "text" or "text | role:foo" or "text | type:organization"');

const prompt = () => {
    rl.question('\nSearch > ', (input) => {
        if (input.trim().toLowerCase() === 'exit') {
            rl.close();
            return;
        }

        try {
            const query = parseQuery(input);
            console.log(`Searching for: "${query.text}" with filters:`, query.filters, `Type: ${query.entityType || 'both'}`);
            
            const results = service.search(query);
            
            if (results.length === 0) {
                console.log('No results found.');
            } else {
                console.log(`Found ${results.length} results:`);
                results.forEach((r, i) => {
                    const name = r.person ? r.person.fullName : r.organization?.name;
                    const details = r.person ? r.person.title : r.organization?.industry;
                    console.log(`${i + 1}. [${r.matchGrade.toUpperCase()}] ${name} (${details}) - Score: ${r.score.toFixed(2)}`);
                    console.log(`   Why: ${r.explanation}`);
                });
            }
        } catch (e) {
            console.error('Error executing search:', e);
        }

        prompt();
    });
};

function parseQuery(input: string): SearchQuery {
    const parts = input.split('|');
    const text = parts[0].trim();
    const query: SearchQuery = { text };

    if (parts.length > 1) {
        query.filters = {};
        for (let i = 1; i < parts.length; i++) {
            const [key, value] = parts[i].split(':').map(s => s.trim());
            if (key && value) {
                if (key === 'role') query.filters.role = value;
                if (key === 'loc') query.filters.location = value;
                if (key === 'funding') query.filters.minFunding = parseInt(value);
                if (key === 'type') query.entityType = value as any;
            }
        }
    }
    return query;
}

prompt();
