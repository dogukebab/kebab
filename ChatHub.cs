using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using MySite.Web.Services;
using System; // for Guid / DateTimeOffset

namespace MySite.Web.Hubs
{
    public class ChatHub : Hub
    {
        private static readonly ConcurrentDictionary<string, string> Users = new();   // guestConnId -> label
        private static readonly ConcurrentDictionary<string, byte> Admins = new();   // adminConnId -> 1

        private readonly ILogger<ChatHub> _log;
        private readonly IChatStore _store;

        public ChatHub(ILogger<ChatHub> log, IChatStore store)
        {
            _log = log;
            _store = store;
        }

        public override async Task OnConnectedAsync()
        {
            // Treat all connections as "guest" until RegisterAdmin() is called.
            var id = Context.ConnectionId;
            var label = $"Guest-{id[^4..].ToUpper()}";
            Users[id] = label;

            // Notify any admins already watching that a guest joined.
            await Clients.Group("admins").SendAsync("GuestJoined", id, label);
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? ex)
        {
            // If an admin disconnected, update admin-online count
            if (Admins.TryRemove(Context.ConnectionId, out _))
                await BroadcastAdminOnline();

            // If a guest disconnected, inform admins
            if (Users.TryRemove(Context.ConnectionId, out var label))
                await Clients.Group("admins").SendAsync("GuestLeft", Context.ConnectionId, label);

            await base.OnDisconnectedAsync(ex);
        }

        // Guest -> Admins + echo back to guest
        public async Task SendFromGuest(string message)
        {
            var id = Context.ConnectionId;
            var label = Users.TryGetValue(id, out var name) ? name : "Guest";
            var msg = new ChatMessage(Guid.NewGuid().ToString("N"), id, label, message, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());

            await _store.SaveAsync(msg);

            // All admins see who sent it (id + label)
            await Clients.Group("admins").SendAsync("ReceiveFromGuest", id, label, msg.Text, msg.Id, msg.Ts);
            // Guest sees their own message as "You"
            await Clients.Client(id).SendAsync("ReceiveToGuest", "You", msg.Text, msg.Id, msg.Ts);
        }

        // Admin registers
        public async Task RegisterAdmin()
        {
            var connId = Context.ConnectionId;

            await Groups.AddToGroupAsync(connId, "admins");
            Admins[connId] = 1;

            // If this connection was pre-added as a "guest" on connect, remove it now.
            if (Users.TryRemove(connId, out var mislabeled))
            {
                // Tell other admins (not the caller) that this "guest" effectively left,
                // so it disappears in their lists without flicker for the new admin.
                await Clients.OthersInGroup("admins").SendAsync("GuestLeft", connId, mislabeled);
            }

            // Send the current guest list to THIS admin only
            foreach (var kv in Users)
                await Clients.Caller.SendAsync("GuestJoined", kv.Key, kv.Value);

            await BroadcastAdminOnline();
        }

        // Admin -> one guest
        public async Task SendFromAdmin(string targetConnectionId, string message)
        {
            var msg = new ChatMessage(
                Guid.NewGuid().ToString("N"),
                targetConnectionId,
                "Support",
                message,
                DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            );

            await _store.SaveAsync(msg);

            // Deliver to the guest as "Support"
            await Clients.Client(targetConnectionId)
                         .SendAsync("ReceiveToGuest", "Support", msg.Text, msg.Id, msg.Ts);

            // Echo to the sending admin as "You" so their UI shows it as 'me'
            await Clients.Caller
                         .SendAsync("ReceiveFromGuest", targetConnectionId, "You", msg.Text, msg.Id, msg.Ts);

            // Make sure OTHER admins also see the message (labeled "Support")
            await Clients.OthersInGroup("admins")
                         .SendAsync("ReceiveFromGuest", targetConnectionId, "Support", msg.Text, msg.Id, msg.Ts);
        }

        // Delete a single message
        public async Task<bool> AdminDeleteMessage(string messageId, string chatId)
        {
            var ok = await _store.SoftDeleteAsync(messageId);
            if (ok)
            {
                await Clients.Group("admins").SendAsync("MessageDeleted", chatId, messageId);
                await Clients.Client(chatId).SendAsync("MessageDeleted", chatId, messageId);
            }
            return ok;
        }

        // Clear entire chat (soft delete all messages)
        public async Task<int> AdminClearChat(string chatId)
        {
            var count = await _store.ClearChatAsync(chatId);
            await Clients.Group("admins").SendAsync("ChatCleared", chatId);
            await Clients.Client(chatId).SendAsync("ChatCleared", chatId);
            return count;
        }

        // Broadcast admin online count to everyone (guests + admins)
        private Task BroadcastAdminOnline()
        {
            var count = Admins.Count;
            return Clients.All.SendAsync("AdminOnline", count);
        }
    }
}
