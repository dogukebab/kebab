using MySite.Web.Hubs;
using MySite.Web.Services;           // ✅ for IChatStore / InMemoryChatStore
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = WebApplication.CreateBuilder(args);

// Services
builder.Services.AddRazorPages();
builder.Services.AddControllers();   // ✅ needed for /api/chats/...
builder.Services.AddSignalR();

// Chat persistence (in-memory for now)
builder.Services.AddSingleton<IChatStore, InMemoryChatStore>();  // ✅

// Build
var app = builder.Build();

// Pipeline
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();

app.UseRouting();
app.UseAuthorization();

// Endpoints
app.MapRazorPages();
app.MapControllers();                // ✅ enables /api/chats/{chatId}/export
app.MapHub<ChatHub>("/chatHub");     // ✅ SignalR hub

app.Run();
