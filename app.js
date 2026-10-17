const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const dbFile = path.join(__dirname, 'library.db');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        createTables();
    }
});

function createTables() {
    db.run(`CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        isbn TEXT UNIQUE,
        status TEXT DEFAULT 'Available'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER,
        member_id INTEGER,
        borrow_date TEXT,
        return_date TEXT,
        status TEXT DEFAULT 'Borrowed',
        FOREIGN KEY(book_id) REFERENCES books(id),
        FOREIGN KEY(member_id) REFERENCES members(id)
    )`);
}

app.get('/api/data', (req, res) => {
    db.all("SELECT * FROM books", [], (err, books) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.all("SELECT * FROM members", [], (err, members) => {
            if (err) return res.status(500).json({ error: err.message });
            
            db.all(`
                SELECT t.id, b.title as book_title, m.name as member_name, t.borrow_date, t.status 
                FROM transactions t
                JOIN books b ON t.book_id = b.id
                JOIN members m ON t.member_id = m.id
            `, [], (err, transactions) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ books, members, transactions });
            });
        });
    });
});

app.post('/api/books', (req, res) => {
    const { title, author, isbn } = req.body;
    db.run(`INSERT INTO books (title, author, isbn) VALUES (?, ?, ?)`, [title, author, isbn], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ id: this.lastID, title, author, isbn, status: 'Available' });
    });
});

app.post('/api/members', (req, res) => {
    const { name, email } = req.body;
    db.run(`INSERT INTO members (name, email) VALUES (?, ?)`, [name, email], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ id: this.lastID, name, email });
    });
});

app.post('/api/issue', (req, res) => {
    const { book_id, member_id } = req.body;
    const borrow_date = new Date().toISOString().split('T')[0];

    db.serialize(() => {
        db.run(`UPDATE books SET status = 'Borrowed' WHERE id = ?`, [book_id]);
        db.run(`INSERT INTO transactions (book_id, member_id, borrow_date, status) VALUES (?, ?, ?, 'Borrowed')`, 
            [book_id, member_id, borrow_date], function(err) {
            if (err) return res.status(400).json({ error: err.message });
            res.json({ message: 'Book issued successfully' });
        });
    });
});

app.post('/api/return/:id', (req, res) => {
    const transactionId = req.params.id;
    const return_date = new Date().toISOString().split('T')[0];

    db.get(`SELECT book_id FROM transactions WHERE id = ?`, [transactionId], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Transaction not found' });
        
        const bookId = row.book_id;
        db.serialize(() => {
            db.run(`UPDATE books SET status = 'Available' WHERE id = ?`, [bookId]);
            db.run(`UPDATE transactions SET status = 'Returned', return_date = ? WHERE id = ?`, [return_date, transactionId], (err) => {
                if (err) return res.status(400).json({ error: err.message });
                res.json({ message: 'Book returned successfully' });
            });
        });
    });
});

app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Library Management System</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light">
        <nav class="navbar navbar-dark bg-dark mb-4">
            <div class="container">
                <a class="navbar-brand" href="#">Library Management System</a>
            </div>
        </nav>

        <div class="container">
            <div class="row mb-4">
                <div class="col-md-4">
                    <div class="card p-3 shadow-sm">
                        <h5>Add Book</h5>
                        <form id="bookForm">
                            <input type="text" class="form-control mb-2" id="bookTitle" placeholder="Title" required>
                            <input type="text" class="form-control mb-2" id="bookAuthor" placeholder="Author" required>
                            <input type="text" class="form-control mb-2" id="bookIsbn" placeholder="ISBN" required>
                            <button type="submit" class="btn btn-primary w-100">Add Book</button>
                        </form>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card p-3 shadow-sm">
                        <h5>Add Member</h5>
                        <form id="memberForm">
                            <input type="text" class="form-control mb-2" id="memberName" placeholder="Full Name" required>
                            <input type="email" class="form-control mb-2" id="memberEmail" placeholder="Email Address" required>
                            <button type="submit" class="btn btn-success w-100">Add Member</button>
                        </form>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card p-3 shadow-sm">
                        <h5>Issue Book</h5>
                        <form id="issueForm">
                            <select class="form-select mb-2" id="issueBookSelect" required></select>
                            <select class="form-select mb-2" id="issueMemberSelect" required></select>
                            <button type="submit" class="btn btn-warning w-100 text-white">Issue Book</button>
                        </form>
                    </div>
                </div>
            </div>

            <div class="row">
                <div class="col-md-6">
                    <div class="card p-3 shadow-sm mb-4">
                        <h5>Books Inventory</h5>
                        <table class="table table-striped">
                            <thead><tr><th>Title</th><th>Author</th><th>Status</th></tr></thead>
                            <tbody id="booksTable"></tbody>
                        </table>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card p-3 shadow-sm mb-4">
                        <h5>Active Transactions</h5>
                        <table class="table table-striped">
                            <thead><tr><th>Book</th><th>Member</th><th>Action</th></tr></thead>
                            <tbody id="transactionsTable"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <script>
            async function loadData() {
                const res = await fetch('/api/data');
                const data = await res.json();
                
                document.getElementById('booksTable').innerHTML = data.books.map(b => 
                    \`<tr><td>\${b.title}</td><td>\${b.author}</td><td><span class="badge \${b.status === 'Available' ? 'bg-success' : 'bg-danger'}">\${b.status}</span></td></tr>\`
                ).join('');

                document.getElementById('issueBookSelect').innerHTML = '<option value="">Select Book</option>' + 
                    data.books.filter(b => b.status === 'Available').map(b => \`<option value="\${b.id}">\${b.title}</option>\`).join('');
                
                document.getElementById('issueMemberSelect').innerHTML = '<option value="">Select Member</option>' + 
                    data.members.map(m => \`<option value="\${m.id}">\${m.name}</option>\`).join('');

                document.getElementById('transactionsTable').innerHTML = data.transactions.filter(t => t.status === 'Borrowed').map(t => 
                    \`<tr><td>\${t.book_title}</td><td>\${t.member_name}</td><td><button class="btn btn-sm btn-danger" onclick="returnBook(\${t.id})">Return</button></td></tr>\`
                ).join('');
            }

            document.getElementById('bookForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                await fetch('/api/books', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: document.getElementById('bookTitle').value,
                        author: document.getElementById('bookAuthor').value,
                        isbn: document.getElementById('bookIsbn').value
                    })
                });
                e.target.reset();
                loadData();
            });

            document.getElementById('memberForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                await fetch('/api/members', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: document.getElementById('memberName').value,
                        email: document.getElementById('memberEmail').value
                    })
                });
                e.target.reset();
                loadData();
            });

            document.getElementById('issueForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                await fetch('/api/issue', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        book_id: document.getElementById('issueBookSelect').value,
                        member_id: document.getElementById('issueMemberSelect').value
                    })
                });
                loadData();
            });

            async function returnBook(id) {
                await fetch(\`/api/return/\${id}\`, { method: 'POST' });
                loadData();
            }

            loadData();
        </script>
    </body>
    </html>
    `);
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
